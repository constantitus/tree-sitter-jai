#include "tree_sitter/alloc.h"
#include "tree_sitter/array.h"
#include "tree_sitter/parser.h"

#include <string.h>

typedef enum {
    SPLIT_IDENTIFIER,
    HEREDOC_START,
    HEREDOC_END,
    ERROR_SENTINEL,
} TokenType;

typedef Array(int32_t) String32;

typedef struct {
    Array(String32) heredocs;
} Scanner;

static const char *const keywords[] = {
    "if", "xx", "for", "ifx", "case", "cast", "else", "enum", "null", "then", "true",
    "break", "defer", "false", "union", "using", "while", "except", "inline", "remove",
    "return", "struct", "type_of", "continue", "operator", "interface", "no_inline",
    "enum_flags", "push_context",
};
#define KEYWORD_COUNT      (sizeof(keywords) / sizeof(keywords[0]))
#define KEYWORD_MAX_LENGTH 12 // push_context

static inline void advance(TSLexer *lexer) { if (!lexer->eof(lexer)) lexer->advance(lexer, false); }
static inline void    skip(TSLexer *lexer) { if (!lexer->eof(lexer)) lexer->advance(lexer, true);  }

static inline bool is_space(int32_t c)             { return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\v' || c == '\f'; }
static inline bool starts_identifier(int32_t c)    { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c >= 0x80; }
static inline bool continues_identifier(int32_t c) { return starts_identifier(c) || (c >= '0' && c <= '9'); }

static inline bool string_eq(String32 *self, String32 *other) {
    if (self->size != other->size)  return false;
    return self->size == 0 || memcmp(self->contents, other->contents, self->size * sizeof(self->contents[0])) == 0;
}

static String32 scan_heredoc_word(TSLexer *lexer) {
    String32 result = (String32)array_new();

    while (continues_identifier(lexer->lookahead)) {
        array_push(&result, lexer->lookahead);
        advance(lexer);
    }

    return result;
}

bool tree_sitter_jai_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
    if (valid_symbols[ERROR_SENTINEL])  return false; // error recovery

    Scanner *scanner = (Scanner *)payload;

    if (valid_symbols[HEREDOC_END] && scanner->heredocs.size > 0) {
        lexer->result_symbol = HEREDOC_END;

        String32 *heredoc = array_back(&scanner->heredocs);
        while (is_space(lexer->lookahead))  skip(lexer);

        String32 word = scan_heredoc_word(lexer);
        bool matches = string_eq(&word, heredoc);
        array_delete(&word);
        if (!matches)  return false;

        lexer->mark_end(lexer);
        array_delete(heredoc);
        (void) array_pop(&scanner->heredocs);
        return true;
    }

    if (valid_symbols[HEREDOC_START]) {
        lexer->result_symbol = HEREDOC_START;

        while (is_space(lexer->lookahead))  skip(lexer);

        String32 heredoc = scan_heredoc_word(lexer);
        if (heredoc.size == 0) {
            array_delete(&heredoc);
            return false;
        }

        lexer->mark_end(lexer);
        array_push(&scanner->heredocs, heredoc);
        return true;
    }

    // Split identifiers, e.g. `this_is_split_for\   _alignment`.
    // A backslash right after an identifier character, followed by whitespace (newlines included),
    // continues the identifier with the next character. Plain identifiers are NOT handled here: we
    // return false and the regular lexer matches them (that keeps keyword extraction working).
    if (valid_symbols[SPLIT_IDENTIFIER]) {
        while (is_space(lexer->lookahead))  skip(lexer);

        if (!starts_identifier(lexer->lookahead))  return false;

        // The joined text, only kept to check for keywords. Anything longer than the longest
        // keyword can't be one, so we stop storing.
        char word[KEYWORD_MAX_LENGTH + 1];
        int  length        = 0;
        bool is_split      = false;
        bool ended_at_mark = false;

        for (;;) {
            int32_t c = lexer->lookahead;

            if (continues_identifier(c)) {
                if (length < KEYWORD_MAX_LENGTH)  word[length] = (char)c;
                length += 1;
                advance(lexer);
                continue;
            }

            if (c != '\\')  break;

            // Maybe a continuation. If it isn't, the token ends right before the backslash.
            lexer->mark_end(lexer);
            advance(lexer);

            int whitespace = 0;
            while (is_space(lexer->lookahead)) {
                advance(lexer);
                whitespace += 1;
            }

            if (whitespace > 0 && continues_identifier(lexer->lookahead)) {
                is_split = true;
                continue;
            }

            ended_at_mark = true;
            break;
        }

        if (!is_split)  return false;

        if (length <= KEYWORD_MAX_LENGTH) {
            word[length] = 0;
            for (unsigned i = 0; i < KEYWORD_COUNT; i += 1) {
                if (strcmp(word, keywords[i]) == 0)  return false;
            }
        }

        if (!ended_at_mark)  lexer->mark_end(lexer);
        lexer->result_symbol = SPLIT_IDENTIFIER;
        return true;
    }

    return false;
}

void *tree_sitter_jai_external_scanner_create() {
    Scanner *scanner = ts_calloc(1, sizeof(Scanner));
    array_init(&scanner->heredocs);
    return scanner;
}

unsigned tree_sitter_jai_external_scanner_serialize(void *payload, char *buffer) {
    Scanner *scanner = (Scanner *)payload;
    unsigned size = 0;

    buffer[size++] = (char)scanner->heredocs.size;
    for (unsigned j = 0; j < scanner->heredocs.size; j += 1) {
        String32 *heredoc = &scanner->heredocs.contents[j];
        unsigned word_size = heredoc->size * sizeof(heredoc->contents[0]);

        if (size + sizeof(int32_t) + word_size >= TREE_SITTER_SERIALIZATION_BUFFER_SIZE)  return 0;

        memcpy(&buffer[size], &heredoc->size, sizeof(int32_t));
        size += sizeof(int32_t);
        if (word_size > 0) {
            memcpy(&buffer[size], heredoc->contents, word_size);
            size += word_size;
        }
    }

    return size;
}

void tree_sitter_jai_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
    Scanner *scanner = (Scanner *)payload;

    for (unsigned i = 0; i < scanner->heredocs.size; i += 1)  array_delete(&scanner->heredocs.contents[i]);
    array_clear(&scanner->heredocs);

    if (length == 0)  return;

    unsigned size = 0;
    uint8_t open_heredoc_count = (uint8_t)buffer[size++];
    for (unsigned i = 0; i < open_heredoc_count; i += 1) {
        String32 heredoc = array_new();

        int32_t word_count;
        memcpy(&word_count, &buffer[size], sizeof(int32_t));
        size += sizeof(int32_t);

        if (word_count > 0) {
            unsigned word_size = (unsigned)word_count * sizeof(int32_t);
            array_reserve(&heredoc, (uint32_t)word_count);
            memcpy(heredoc.contents, &buffer[size], word_size);
            heredoc.size = (uint32_t)word_count;
            size += word_size;
        }

        array_push(&scanner->heredocs, heredoc);
    }
}

void tree_sitter_jai_external_scanner_destroy(void *payload) {
    Scanner *scanner = (Scanner *)payload;
    for (size_t i = 0; i < scanner->heredocs.size; i += 1)  array_delete(&scanner->heredocs.contents[i]);
    array_delete(&scanner->heredocs);
    ts_free(scanner);
}
