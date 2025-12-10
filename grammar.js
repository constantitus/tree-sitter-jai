// Credits to the following sources
// - tree-sitter-odin and the other tree-sitter-jai implementations (general inspiration)
// - tree-sitter-go (for the integer and floats matching)
// - tree-sitter-tlaplus (for nested block comments)
// - tree-sitter-php for the heredoc stuff

/// <reference types="tree-sitter-cli/dsl" />
// @ts-nocheck

const PREC = {
    ASSIGNMENT:       1,

    LOGICAL_OR:       4,
    LOGICAL_AND:      5,
    BITWISE_OR:       7,
    BITWISE_XOR:      6,
    BITWISE_AND:      8,
    BITWISE_AND_NOT:  9,
    EQUALITY:         10,
    COMPARE:          11,
    SHIFT:            12,
    ADD:              13,
    MULTIPLY:         14,
    CAST:             15,
    UNARY:            17,

    CALL:             19,
    MEMBER:           31,
    RUN:              32
};


const BIN = /[01]/;
const BIN_ = seq(optional("_"), BIN);
const BIN_INT = seq(BIN, repeat(BIN_));

const OCT = /[0-7]/;
const OCT_ = seq(optional("_"), OCT);
const OCT_INT = seq(OCT, repeat(OCT_));

const HEX = /[0-9a-fA-F]/;
const HEX_ = seq(optional("_"), HEX);
const HEX_INT = seq(HEX, repeat(HEX_));

const DEC = /[0-9]/;
const DEC_ = seq(optional("_"), DEC);
const DEC_INT = seq(DEC, repeat(DEC_));

module.exports = grammar({
    name: "jai",

    conflicts: $ => [
        [$.all_statements, $.statements_that_dont_require_a_semicolon],
        [$.call_expression, $.parameterized_struct_type],
        [$.named_parameters, $.assignment_parameters],
        [$.named_return, $.parameter],

        [$.named_parameters, $.procedure_returns, $.assignment_parameters],
        [$.named_return],
        [$.expressions, $.variable_declaration, $.const_declaration, $.assignment_statement, $.update_statement],
        [$.expressions, $.variable_declaration, $.const_declaration, $.assignment_statement],
        [$.polymorphic_type],

        [$.member_expression, $.types, $.member_type, $.struct_literal, $.array_literal],

        // [$.top_level_declarations, $.call_expression],
        [$.identifier_type, $.types, $.parameterized_struct_type],
        [$.expressions, $.identifier_type, $.assignment_parameters, $.types],
        [$.identifier_type, $.named_return, $.types],

        [$.member_type_in_procedure_returns, $.identifier_type, $.types, $.member_type],

        [$.parenthesized_expression, $.assignment_parameters],
    ],

    externals: $ => [
        // $.identifier,
        $.heredoc_start,
        $.heredoc_end,
        $.error_sentinel,
    ],

    extras: $ => [
        $.comment,
        $.block_comment,
        /\s/,
        $.note,
    ],

    supertypes: $ => [
        $.all_statements,
        $.statements_that_dont_require_a_semicolon,
        $.expressions,
        $.literal,
    ],

    word: $ => $.identifier,

    rules: {
        source_file: $ => repeat(seq($.statement, optional(';'))),

        /* top_level_declarations: $ => choice(
            $.procedure_declaration,
            $.struct_declaration,
            $.enum_declaration,
            $.static_if_statement,

            $.run_statement,
            $.compiler_directive,

            $.using_statement,
            $.module_parameters,
            seq($.compiler_directive, $.string),
            seq($.declarations_that_require_a_semicolon, ';'),
        ), */

        declarations_that_require_a_semicolon: $ => choice(
            $.module_parameters,
            $.assert_statement,
            $.placeholder_declaration,
            $.const_declaration,
            $.variable_declaration,
            $.import,
            $.load,
            $.call_expression, // this could be a macro call in global scope.
        ),

        // In procedure scopes
        statement: $ => choice(
            seq($.all_statements, ';'),
            $.statements_that_dont_require_a_semicolon,
            prec(-2, ';'),
        ),

        all_statements: $ => choice(
            $.block,
            $.compiler_directive,
            $.run_statement,
            $.asm_statement,
            $.import_or_load,

            // Only in procedures
            $.backtick_statement,

            $.procedure_declaration,
            $.struct_declaration,
            $.enum_declaration,

            $.assignment_statement,
            $.update_statement,

            $.if_statement,
            $.static_if_statement,
            $.while_statement,
            $.for_statement,

            $.defer_statement,
            $.return_statement,
            $.break_statement,
            $.continue_statement,
            $.remove_statement,
            $.push_context_statement,

            $.expressions,

            $.declarations_that_require_a_semicolon,
        ),

        import_or_load: $ => seq($.compiler_directive, $.string),

        statements_that_dont_require_a_semicolon: $ => choice(
            $.block,
            $.run_statement,
            $.asm_statement,

            $.backtick_statement,

            $.procedure_declaration,
            $.struct_declaration,
            $.struct_or_union,
            $.enum_declaration,

            $.if_statement,
            $.static_if_statement,
            $.while_statement,
            $.for_statement,
            $.using_statement,
            $.push_context_statement,
            $.no_semicolon_declaration,
        ),

        // Inside statements or as arguments
        expressions: $ => prec.right(30, choice(
            $.parenthesized_expression,

            $.cast_expression,
            $.cast_v2_expression,
            $.auto_cast_expression,
            $.unary_expression,
            $.binary_expression,

            $.call_expression,
            $.member_expression,
            $.index_expression,

            $.if_expression,

            prec(-1, field('name', $.identifier)),
            $.address,
            $.literal,
            $.pointer_expression,
            $.quick_procedure,

            // I don't want all types to be expressions
            // $.types,
            $.type_of_expression,
            $.run_or_insert_expression,
            $.code_expression,
            $.library_expression,
            $.compiler_directive,
        )),

        run_or_insert_expression: $ => prec(PREC.RUN, seq(
            alias(choice('#run', '#insert'), $.compiler_directive),
            field('modifier', optional(seq(',', comma_sep1($.identifier)))),
            optional($.insert_parameters), // e.g.: #insert(remove=remove it)
            choice(
                seq( // return value
                    '->',
                    field('result', choice(
                        seq(
                            '(',
                            optional(comma_sep1(
                                choice($.types, $.named_return)
                            )),
                            ')'
                        ),
                        comma_sep1(choice($.types, $.named_return)),
                    )),
                    $.block,
                ),
                $.expressions
            ),
        )),

        insert_parameters: $ => prec(1, seq(
            '(',
            // TODO: this can surely be simplified
            optional(
                sep1(
                    seq(
                        $.identifier,
                        '=',
                        choice(
                            $.block,
                            $.remove_statement,
                            $.break_statement,
                            $.continue_statement,
                        )
                    )
                , ',')
            ),
            ')',
        )),

        //
        // declarations
        //

        block: $ => prec(2, seq(
            '{',
            repeat($.statement),
            '}',
        )),

        compiler_directive: $ => prec.left(choice(
            field('directive', seq('#', comma_sep1($.identifier)))
        )),

        import: $ => prec.right(seq(
            optional(seq(
                field('name', $.identifier),
                ':', ':'
            )),
            alias(field('directive', '#import'), $.compiler_directive),
            optional(field('modifier', choice(
                ',file',
                ',dir',
                ',string',
            ))),
            field('name', $.string),
            optional(field('module_parameters', $.assignment_parameters)),
        )),

        load: $ => seq(
            alias(field('directive', '#load'), $.compiler_directive),
            field('path', $.string),
        ),

        module_parameters: $ => seq(
            alias(field('directive', '#module_parameters'), $.compiler_directive),
            $.named_parameters,
            optional($.named_parameters),
            optional($.block),
        ),

        procedure_declaration: $ => prec(1, seq(
            field('name', choice(
                $.identifier,
                seq(
                    'operator',
                    // I forgor which operators can be overloaded, lol
                    choice(
                        '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', 
                        '+',  '-',  '*',  '/',  '%',  '&',  '|',  '^',
                        '<<', '>>', '||', '&&', '<<<', '>>>',
                        '<<=', '>>=', '||=', '&&=', '<<<=', '>>>=',
                        '==', '!=', '~', '&~', '>', '>=', '<=', '<',
                        '[]', '[]=', '*[]', '!',
                    )
                )
            )),
            ':', ':',
            optional(field('modifier', choice('inline', 'no_inline'))),
            $.procedure,
            optional($.modify_block),
            choice($.block, ';'),
        )),

        struct_declaration: $ => seq(
            field('name', $.identifier),
            ':', ':',
            $.struct_or_union,
        ),

        struct_or_union: $ => seq(
            choice('struct', 'union'),
            optional($.compiler_directive),
            // Parameterized structs
            field('modifier', optional($.named_parameters)),
            optional($.modify_block),
            $.struct_or_union_block,
        ),

        struct_or_union_block: $ => prec.left(seq(
            '{',
            optional(repeat(choice(
                alias(field('directive', '#as'), $.compiler_directive),
                $.run_or_insert_expression,
                $.run_statement,
                $.procedure_declaration,
                $.struct_declaration,
                $.enum_declaration,
                $.no_semicolon_declaration,
                $.struct_or_union,
                $.static_if_statement,
                $.using_statement,
                ';',
                seq(
                    choice(
                        $.insert_statement,
                        $.const_declaration,   
                        $.assignment_statement,
                        $.variable_declaration,
                        $.place_directive,
                    ),
                    optional($.align_directive),
                    ';'
                ),
            ))),
            '}',
        )),

        modify_block: $ => seq(alias(field('directive', '#modify'), $.compiler_directive), $.block),

        place_directive: $ => seq(alias(field('directive', "#place"), $.compiler_directive), $.identifier),

        align_directive: $ => seq(alias(field('directive', '#align'), $.compiler_directive), $.expressions),

        enum_declaration: $ => prec(1, seq( // conflict with const_declaration
            field('name', $.identifier),
            ':', ':',
            choice('enum', 'enum_flags'),
            optional(field('type', $.types)),
            optional($.compiler_directive),
            optional($.specified_directive),
            '{',
            repeat($.enum_field),
            '}',
        )),

        enum_field: ($) => choice(
            seq(
                $.identifier,
                optional(seq(":", ":", $.expressions)),
                ";"
            ),
            $.run_or_insert_expression,
            $.using_statement,
            ";",
        ),
          
        variable_declaration: $ => seq(
            prec.right(field('name', comma_sep1($.identifier))),
            // optional(','),
            ':',
            choice(
                seq(
                    optional(field('type', $.types)),
                    '=',
                    prec.right(comma_sep1(choice($.expressions, $.procedure, $.types))),
                ),
                field('type', $.types),
            )
        ),

        const_declaration: $ => seq(
            prec.right(field('name', comma_sep1($.identifier))),
            // optional(','),
            ':',
            optional(field('type', $.types)),
            ':',
            prec.right(comma_sep1(
                choice($.expressions, $.types),
            )),
            // optional(','),
        ),

        no_semicolon_declaration: $ => seq(
            prec.right(field('name', $.identifier)),
            ':',
            choice(
                $.anonymous_struct_type,
                $.anonymous_enum_type,
            )
        ),

        placeholder_declaration: $ => seq(
            alias(field('directive', '#placeholder'), $.compiler_directive),
            field('name', $.identifier),
        ),

        quick_procedure: $ => seq(
            choice($.identifier, $.assignment_parameters),
            '=>',
            choice($.expressions, $.block),
        ),


        //
        // statements
        //

        run_statement: $ => seq(
            alias(field('directive', '#run'), $.compiler_directive),
            field('modifier', optional(seq(',', comma_sep1($.identifier)))),
            $.statement,
        ),

        insert_statement: $ => seq(
            alias(field('directive', '#insert'), $.compiler_directive),
            $.statement,
        ),

        code_expression: $ => prec.left(seq(
            alias(field('directive', '#code'), $.compiler_directive),
            choice($.expressions, $.block),
        )),

        library_expression: $ => prec.right(seq(
            alias(field('directive', choice('#library', '#system_library')), $.compiler_directive),
            field('modifier', optional(seq(',', comma_sep1($.identifier)))),
            optional($.string),
        )),

        assert_statement: $ => seq(
            alias(field('directive', '#assert'), $.compiler_directive),
            $.expressions, optional(field('message', $.string))
        ),

        // TODO: this is still not right...
        asm_statement: $ => prec.right(seq(
            alias(field('directive', '#asm'), $.compiler_directive),
            field('modifier', optional(comma_sep1($.identifier))),
            '{',
            repeat($.asm_line),
            '}'
        )),

        asm_register: $ => choice(
            seq(
                field('name', $.identifier),
                ':',
                optional(seq(
                    field('type', $.identifier),
                    optional(seq(
                        '===',
                        $.asm_size_or_register,
                    ))
                )),
            ),
            seq(
                field('name', $.identifier),
                '===',
                $.asm_size_or_register,
            )
        ),

        asm_size_or_register: _ => prec.left(999, /[A-Za-z0-9]+/),

        asm_line: $ => seq(choice(
            seq(
                $.asm_mnemonic,
                sep($.asm_operand, ','),
            ),
            $.asm_register,
        ), ';'),

        asm_mnemonic: $ => prec.right(seq(
            $.identifier,
            optional(seq(
                // TODO: e.g. mov.64 does not parse correctly
                choice('.', '?'),
                $.asm_size_or_register
            ))
        )),

        asm_operand: $ => choice(
            seq('[', $.expressions, ']'), // dereference
            $.expressions,
            $.asm_register,
        ),

        asm_size: $ => prec(999, seq(
            $.asm_size_or_register
        )),

        backtick_statement: $ => seq('`', $.statement),

        using_statement: $ => prec.left(PREC.CAST, seq(
            field('keyword', 'using'),
            field('modifier', optional(seq(',', comma_sep1(
                choice(
                    $.identifier,
                    seq('except', $.assignment_parameters)
                )
            )))),
            $.statement,
        )),

        assignment_statement: $ => prec.left(PREC.ASSIGNMENT, seq(
            comma_sep1(choice(
                $.expressions,
                $.identifier,
            )),
            '=',
            comma_sep1(choice(
                $.expressions,
                $.procedure,
                $.types
            )),
        )),

        update_statement: $ => seq(
            comma_sep1(choice(
                $.expressions,
                $.identifier,
            )),
            choice(
                '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
                '<<=', '>>=', '<<<=', '>>>=', '||=', '&&=',
            ),
            comma_sep1($.expressions, $.procedure),
        ),

        if_statement: $ => prec.right(seq(
            'if',
            choice(
                $.if_statement_condition_and_consequence,
                $.if_case_statement,
            ),
        )),

        static_if_statement: $ => prec.right(seq(
            field('directive', alias(seq('#', 'if'), $.compiler_directive)),
            choice(
                $.if_statement_condition_and_consequence,
                $.if_case_statement,
            ),
        )),

        if_statement_condition_and_consequence: $ => prec.right(seq(
            field('condition', $.if_condition),
            optional('then'),
            field('consequence', $.statement),
            // Technically, in static_if, the else clause should not allow a regular if, but whatever...
            optional(field('alternative', $.else_clause)),
        )),

        if_condition: $ => prec.right($.expressions),

        else_clause: $ => seq(
            "else",
            field('consequence', $.statement)
        ),

        if_case_statement: $ => seq(
            optional(alias('#complete', $.compiler_directive)),
            field('condition', $.expressions),
            '==',
            '{',
            repeat($.switch_case),
            '}',
        ),

        while_statement: $ => prec.right(seq(
            'while',
            field('condition', $._while_condition),
            field('body', $.statement),
        )),
        
        _while_condition: $ => prec.right(seq(
            optional(
                field('name',
                    seq(
                        $.identifier,
                        ':',
                        optional($.types),
                        '='
                    )
                )),
            $.expressions,
        )),

        // For loop
        for_statement: $ => prec.right(3, seq(
            'for',
            optional(field('modifier', '#v2')), // I guess this is temporary
            optional('<'),
            optional(seq(':', $.identifier)),
            optional(field('value', seq(
                comma_sep1(seq(optional('*'), $.identifier)),
                ':',
            ))),
            choice(
                field('range',    $._for_range),
                field('iterator', $._for_iterator),
            ),
            field('body', $.statement),
        )),

        _for_iterator: $ => prec.right(-1, seq(
            optional('*'), $.expressions,
        )),

        _for_range: $ => prec.right(seq(
            field('range_from', $.expressions),
            $._range_operator,
            field('range_to', $.expressions)
        )),

        _range_operator: _ => prec.left(99, '..'),


        break_statement: $ => seq('break', optional($.identifier)),

        continue_statement: $ => seq('continue', optional($.identifier)),

        remove_statement: $ => seq('remove', optional($.identifier)),

        defer_statement: $ => seq('defer', $.statement),

        push_context_statement: $ => seq(
            'push_context',
            field('modifier', optional(seq(',', comma_sep1($.identifier)))),
            $.expressions,
            choice($.block, ';'),
        ),

        return_statement: $ => seq(
            'return',
            optional(comma_sep1($.expressions)),
        ),


        //
        // expressions
        //

        parenthesized_expression: $ => 
            seq('(', choice(
                $.expressions,
                $.identifier
            ), ')')
        ,

        unary_expression: $ => prec.left(PREC.UNARY, seq(
            field('operator', choice('+', '-', '~', '!', '&')),
            field('argument', $.expressions),
        )),

        binary_expression: $ => {
            const table = [
                ['||',  PREC.LOGICAL_OR],
                ['&&',  PREC.LOGICAL_AND],
                ['>',   PREC.COMPARE],
                ['>=',  PREC.COMPARE],
                ['<=',  PREC.COMPARE],
                ['<',   PREC.COMPARE],
                ['==',  PREC.EQUALITY],
                ['!=',  PREC.EQUALITY],
                ['|',   PREC.BITWISE_OR],
                ['^',   PREC.BITWISE_XOR],
                ['&',   PREC.BITWISE_AND],
                ['&~',  PREC.BITWISE_AND_NOT],
                ['<<',  PREC.SHIFT],
                ['>>',  PREC.SHIFT],
                ['<<<', PREC.SHIFT],
                ['>>>', PREC.SHIFT],
                ['+',   PREC.ADD],
                ['-',   PREC.ADD],
                ['*',   PREC.MULTIPLY],
                ['/',   PREC.MULTIPLY],
                ['%',   PREC.MULTIPLY],
            ];

            return choice(...table.map(([operator, precedence]) => {
                return prec.left(precedence, seq(
                    field('left', $.expressions),
                    // @ts-ignore
                    field('operator', operator),
                    field('right', $.expressions),
                ));
            }));
        },

        pointer_expression: $ => prec.left(seq(
            choice(
                field('operator', '<<'),
                field('operator', '(.*)'),
            ),
            field('argument', $.expressions)
        )),

        call_expression: $ => prec.dynamic(PREC.CALL, seq(
            optional(field('modifier', 'inline')),
            field('function', choice(
                choice(
                    $.identifier,
                    $.compiler_directive
                ),
                $.parenthesized_expression
            )),
            $.assignment_parameters,
        )),

        // TODO: fix member issues
        //  member.*.other
        //  member.(type)
        member_expression: $ => prec.left(PREC.MEMBER, seq(
            optional(choice(
                $.call_expression,
                $.parenthesized_expression,
                $.member_expression,
                $.index_expression,
                $.type_of_expression,
                $.identifier,
                $.cast_v2_expression,
                $.string,
            )),
            '.',
            prec.left(choice(
                $.member_expression,
                $.identifier,
                $.call_expression,
                $.postfix_dereference,
            )),
        )),

        postfix_dereference: _ => prec.left('*'),

        index_expression: $ => prec(PREC.MEMBER, seq(
            $.expressions,
            '[',
            $.expressions,
            optional(seq(',', $.expressions)),
            ']',
        )),

        type_of_expression: $ => seq(
            field('type', 'type_of'),
            '(',
            $.expressions,
            ')'
        ),

        // If expressions are limited until I figure out how to make it not lag the
        // shit out of the parser...
        if_expression: $ => prec.right(seq(
            choice('ifx', alias(seq('#', 'ifx'), $.compiler_directive)),
            field('condition', $.expressions),
            optional('then'),
            optional(field('consequence',
                choice($.expressions, $.block)
            )),
            optional(field('alternative',
                seq('else', choice($.expressions, $.block))
            )),
        )),

        cast_expression: $ => prec(PREC.CAST, seq(
            // cast,force () / xx,force
            choice(
                seq(
                    'cast',
                    field('modifier', optional(seq(',', comma_sep1($.identifier)))),
                    '(',
                    $.types,
                    ')',
                ),
            ),
            $.expressions
        )),

        cast_v2_expression: $ => prec(PREC.CAST, seq(
            seq(
                'cast',
                field('modifier', optional(seq(',', comma_sep1($.identifier)))),
                '(',
                $.types,
                ',',
                $.expressions,
                ')',
            ),
        )),

        auto_cast_expression: $ => prec(PREC.CAST, seq(
            'xx',
            field('modifier', optional(seq(',', comma_sep1($.identifier)))),
            $.expressions,
        )),

        //
        // 
        //

        // Procedure and procedure type
        procedure: $ => prec.right(PREC.CALL, seq(
            // 'assignment_parameters' is only valid for procedure types, not for procedure
            // declarations, but I don't feel like having 2 of these.
            choice ($.assignment_parameters, $.named_parameters),
            optional(seq(
                '->',
                field('result', $.procedure_returns)
            )),
            field('modifier', repeat(
                prec.right(2, seq(
                    $.compiler_directive,
                    optional(choice($.identifier, $.string))
                ))
            )),
        )),

        procedure_returns: $ => prec.left(choice(
            // This is a procedure that returns nothing: () -> ()
            // This is a procedure that returns a procedure; () -> (())
            seq(
                '(',
                sep(
                    $.returns, ','
                ),
                ')'
            ),
            prec.right(sep1($.returns, ',')),
        )),

        returns: $ => prec.left(1, seq(
            choice(
                // This is gross.
                $.parameterized_struct_type,
                $.named_return,
                $.types,
                $.identifier_type,
                $.member_type_in_procedure_returns,
            ),
            optional(alias("#must", $.compiler_directive))
        )),

        // I hate writing tree-sitter parsers so bad rn...
        member_type_in_procedure_returns: $ => prec.left(999, field('type',
            seq(
                choice(
                    $.member_type_in_procedure_returns,
                    $.identifier,
                ),
                '.',
                $.identifier
            )
        )),

        identifier_type: $ => field('type', $.identifier),

        named_return: $ => seq(
            // This here should be a regular variable declaration (where "name := value" is valid too),
            // but it seems to work without having the 'types' be optional. I don't want to change it
            // because 'variable_declaration' is also a compound declaration, which would not work here.
            $.identifier,
            ':',
            $.types,
            optional(seq('=', $.literal))
        ),

        // Procedure and Struct
        named_parameters: $ => seq(
            '(',
            field('parameters', optional(seq(
                comma_sep1(prec(1, choice($.parameter, $.types))),
                // optional(','),
            ))),
            ')'
        ),

        parameter: $ => seq(
            optional($.compiler_directive),
            field('keyword', optional('using')),
            field('name', seq(
                optional('$'),
                optional('$'),
                $.identifier
            )),
            ':',
            choice(
                field('type', seq(
                    optional('..'),
                    $.types
                )),
                seq(
                    field('type', optional(seq(
                        optional('..'),
                        $.types
                    ))),
                    seq(
                        '=',
                        field('default_value', choice(
                            $.expressions,
                            $.types,
                            $.compiler_directive,
                        ))
                    )
                ),
            ),
        ),

        assignment_parameters: $ => seq(
            '(',
            // TODO: this can surely be simplified
            optional(seq(
                sep1_prec_right(PREC.CALL, optional(seq(
                    // Named arguments
                    //  procedure(arg2 = 2);

                    field('named_argument',
                        optional(seq(
                            $.identifier,
                            '='
                        ))
                    ),
                    optional('..'),
                    field('argument', choice(
                        $.expressions,
                        $.identifier,
                        $.procedure,
                        $.types,
                    )),
                )), ','),
                // optional(','),
            )),
            ')',
        ),

        // Enum declaration
        specified_directive: $ => alias('#specified', $.compiler_directive),

        // If case
        switch_case: $ => seq(
            'case',
            optional(field('value', $.expressions)),
            ';',
            repeat($.statement),
            optional(seq($.through_statement, ';')),
        ),
        through_statement: $ => alias('#through', $.compiler_directive),

        //
        // Types
        //

        types: $ => prec(2, choice(
            $.pointer_type,
            $.anonymous_struct_type,
            $.anonymous_enum_type,
            $.array_type,
            $.type_of_expression,
            $.type_literal,
            $.procedure,
            $.parameterized_struct_type,
            $.polymorphic_type,
            $.member_type,
            prec(-2, $.identifier),
        )),

        member_type: $ => prec(-1, seq($.identifier, '.', $.identifier)),

        polymorphic_type: $ => seq(
            optional('$'),
            '$', $.types,
            optional(seq(
                '/',
                field('keyword', optional('interface')),
                $.identifier
            ))),

        type_literal: $ => prec.right(seq(
            '#type',
            optional(seq(',', field('modifier', $.identifier))), // #type,isa
            $.types,
        )),

        parameterized_struct_type: $ => prec.dynamic(PREC.CALL - 1, seq(
            field('type', $.identifier),
            $.assignment_parameters,
        )),

        anonymous_struct_type: $ => prec(-1, seq( // conflict with struct_declaration
            // Valid anonymous struct syntax:
            //  variable := struct {};
            //  variable : struct {} = .{};
            choice('struct', 'union'),
            optional($.compiler_directive),

            // Also valid in terms that the compiler will not complain, but
            // useless since you cannot put anything inside the parentheses:
            //  variable := struct() {};
            //  variable : struct() {} = .{};
            // optional(seq( '(', ')')),

            $.struct_or_union_block,
        )),

        anonymous_enum_type: $ => prec(-1, seq(
            choice('enum', 'enum_flags'),
            optional(field('type', $.types)),
            optional($.specified_directive),
            '{',
            repeat($.enum_field),
            '}',
        )),

        // TODO : Differentiate between taking the address of a variable and pointer types
        pointer_type: $ => prec.left(PREC.CAST, seq('*', $.types)),

        array_type: $ => prec.left(seq(
            '[',
            optional(seq(choice('..', $.expressions))),
            ']',
            optional(choice(
                field('type', $.types),
                field('type', $.identifier)
            )),
        )),

        //
        // literals
        //

        literal: $ => choice(
            $.integer,
            $.float,
            $.string,
            $.char_string,
            $.string_directive,
            $.struct_literal,
            $.array_literal,
            $.boolean,
            $.null,
            $.uninitialized,
        ),

        struct_literal: $ => prec.left(PREC.CALL, seq(
            optional(
                prec.left(choice(
                    seq('(', field('type', $.types), ')'),
                    field('type', $.types),
                    field('type', $.identifier),
                )),
            ),
            optional(field('parameters', $.named_parameters)),

            '.',
            '{',
            optional(seq(
                comma_sep1(field('parameter', seq(
                    optional(seq(field('name',
                        choice(
                            $.identifier,
                            $.index_expression // maybe there are more cases like this
                        )
                    ), '=')), // named
                    $.expressions,
                ))),
                optional(','),
            )),
            '}',
        )),

        array_literal: $ => prec.left(PREC.CALL, seq(
            optional(
                choice(
                    seq('(', field('type', $.types), ')'),
                    field('type', $.types),
                    field('type', $.identifier),
                ),
            ),
            '.',
            '[',
            optional(seq(
                comma_sep1($.expressions),
                optional(','),
            )),
            ']',
        )),

        boolean: _ => field('keyword', choice('true', 'false')),
        null: _ => field('keyword', 'null'),
        uninitialized: _ => '---',

        address: $ => seq('*', $.expressions),

        char_string: $ => prec.left(seq(
            field('modifier', '#char'),
            $.string
        )),

        string: $ => prec(2, seq(
            choice(token('"'), token('"//')), // I hate this...
            repeat($.string_contents),
            token('"'),
        )),

        string_contents: $ => prec(2, choice(
            prec(2, /\s/), // This is so comments don't match inside a string.
            // prec(2, '/'),
            prec(2, '//'),
            // prec(2, token('/')),
            prec(2, token('//')),
            prec(2, token('/*')),
            $.string_content,
            $.escape_sequence,
        )),

        string_directive: $ => seq(
            field('directive', '#string'),
            $.heredoc_start,
            repeat($.heredoc_body),
            $.heredoc_end,
        ),

        // anything that is not whitespace
        heredoc_body: _ => choice(
            prec(2, token(/[^\s]+/)),
            prec(2, token('/*'))
        ),
        string_content: _ => prec(2, token(/[^"\\\n]+/)),

        escape_sequence: _ => prec(2, token.immediate(seq(
            '\\',
            choice(
                /[^xu0-7]/,
                /[0-7]{1,3}/,
                /x[0-9a-fA-F]{2}/,
                /u[0-9a-fA-F]{4}/,
                /u\{[0-9a-fA-F]+\}/,
                /U[0-9a-fA-F]{8}/,
            ),
            optional(token('//')), // This is so we can't have a comment right after an escape... dumb as fuck but whatever
        ))),

        identifier: _ => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

        integer: _ =>
            choice(
                token(seq('0', choice("b", "B"), optional('_'), BIN_INT)),
                token(seq('0', choice("o", "O"), optional('_'), OCT_INT)),
                token(seq('0', choice("x", "X"), optional('_'), HEX_INT)),
                token(DEC_INT),
            ),

        float: _ =>
            choice(
                // Floats in hex
                token(seq(choice("0h", "0H"), HEX_INT)),
                token(seq(
                    choice("0x", "0h"), HEX_INT, ".", HEX_INT,
                    optional(seq(/[pP][-+]?/, DEC_INT))
                )),
                token(seq(
                    seq(optional(DEC_INT), ".", DEC_INT),
                    optional(seq(/[eE][-+]?/, DEC_INT))
                )),
                // floats with no decimal break other parts of the syntax.
                // TODO: find a way to add them without breaking shit
                // seq(DEC_INT, ".", optional(DEC_INT)),
                token(seq(
                    choice("0x", "0X"), HEX_INT, /[pP][-+]?/, DEC_INT
                )),
                token(seq(DEC_INT, /[eE][-+]?/, DEC_INT))
            ),

        // extras

        note: $ => token(prec(-1, seq('@', /[^\s;]+|"[^"\\\n]*"/))),

        comment: _ => prec(1, token(seq('//', /([^\n]|[*][^/\n]|[/][^*\n])*/))),
        // comment: _ => prec(1, token(seq('//', /([^*/\n]|[*][^/\n]|[/][^*\n])*/))),
        // comment: _ => token(seq('//', /(\\+(.|\r?\n)|[^\\\n])*/)),

        block_comment: $ => seq(
            token(prec(0, "/*")),
            repeat($.block_comment_text,),
            token(prec(0, '*/'))
        ),

        block_comment_text: $ => prec.right(0, repeat1(choice(
            token(prec(0, /[^*/]|[*][^/]|[/][^*]/)),
            // token(prec(0, /[^*]|[^/]/)),

            // token(prec(1, regexOr(
            //     '[^*/]',    // any symbol except reserved
            //     '[^*][/]',  // closing parenthesis, which is not a comment end
            //     '[/][^/*]', // opening parenthesis, which is not a comment start
            //     '[*][/][ \t]*(\r\n|\n)?[ \t]*[/][*]' // contiguous block comment border
            // ))),
            // token(prec(1, /\*/)),
            // token(prec(1, /\//)),

        ))),
}
});

function regexOr(regex) {
    if (arguments.length > 1) {
        regex = Array.from(arguments).join('|');
    }
    return {
        type: 'PATTERN',
        value: regex
    };
}

// Creates a rule to match zero or more occurrences of `rule` separated by `sep`
function sep(rule, s) {
    return optional(seq(rule, repeat(seq(s, optional(rule)))));
}

// Creates a rule to match one or more occurrences of `rule` separated by `sep`
function sep1(rule, s) {
    return seq(rule, repeat(seq(s, rule)));
}

// Same as sep1, but allows passing right precedence
function sep1_prec_right(p, rule, s) {
    return seq(rule, repeat(prec.right(p, seq(s, rule))));
}

// Same as sep1, but allows passing precedence
function sep1_prec(p, rule, s) {
    return seq(rule, repeat(prec(p, seq(s, rule))));
}

// Creates a rule to match one or more of the rules separated by a comma
function comma_sep1(rule) {
    return sep1(rule, ',');
}
