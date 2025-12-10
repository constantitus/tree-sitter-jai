# tree-sitter-jai
Tree-sitter grammar for the language.


I don't actively maintain this anymore. For now, I'll be merging pull requests for now, but someone should
really write a simpler one, this is pretty much a mess.


For anyone who wants to start writing one from scratch, here's some things to consider:
- The biggest one would be split identifiers (e.g. `this_is_split_for\   _alignment`), which are present
pretty much everywhere in the modules shipped with the compiler. To parse them, you have to do it in `scanner.c`.
And if you parse them in C, you also have to handle all keywords (and perhaps the compiler declarations) in
C as well.
- It should also be simpler. For the purpose of angry fruit salad highlighting, this should be more of a
lexer with minimal context awareness rather than a full blown parser. This is especially true for a language
that is still in beta and is constantly changing it's syntax or adding/removing features.
