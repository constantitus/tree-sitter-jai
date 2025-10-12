//
// Test file I use to test the grammar
//

/*



*/

/*
   Block coments

   //
   //

    /*
     * That are nested
     *
     *
     */ (C/C++ would end the block here)

   I will use this file to see if anything breaks as I add features or to fix bugs in
   the grammar. More cases will be added as it gets more complex.

 */

test_proc0 :: () -> type, parameterized_struct_type(T), named_return := struct_literal.{} {}

test_proc1 :: () -> m.t.t.t.t.t {
}

test_proc2 :: () -> a {

}


#import "Compiler";
#import "Basic";

HEREDOC_STRING0 :: #string END
this is a strin

\r \\
 \n \/
  \t
   \0
    %
;;;,,,
{{{
[][
()(
.
:: :
-- -
"
END;

HEREDOC_STRING1 :: #string DONE on the same line DONE;

named_import :: #import "Named";

#load "something.jai";

#module_parameters (some_param : bool)(some_other_param := no, thing: string, );

Calendar_Time :: struct {
    // year:        s32;
    // month\      _starting_at_0: s8;
    // day_of_month_starting_at_0: s8;
    // day_of_week\_starting_at_0: s8;
    // ...
}

TestStruct1 :: struct {
    #as using a : b;

    var1 : int;
    var3 := 0xDEAD_BEEF;
    var4 : float32 = 0hAB_CD_12_34;
    CONST1: string : "as if the string is going to fluctuate";
    CONST2 :: -1_2_3_4_5_6_7_0;
    CONST3 : int : #char "β";
    // I'll add as I encounter more issues
};

TestStruct2 :: struct (type: Type = s64) {
    union {
        a: int;
        b: float;
    }
    
    padding:   [120] u8;
    rectangle: Rectangle #align 16;
    next: *Test_Struct2;
};

TestEnum :: enum { A; B; }
test_enum: enum {
    A;
    B;
    #run -> string { return "C;"; }
}

Rectangle :: struct
#modify {

}
{
    x, y: float;
    w, h: float;
#place w;
    width, height: float;
};

call_expression :: (polymorphic_args: $T) -> () {
    print("%%%%%\n",1, s32, "some random args", .{10}, .[10]);
    print("%\n", polymorphic_args);

    context.log_level = .NORMAL;
    context.logger = logger_proc;

};

some_complex_ass_procedure_declaration ::
inline (a1: s32, a2: s64, a3: int, a4: float)
-> no, yes, maybe, when, whomst:s32
#external c_library #c_call #deprecated "deprecation message"
#modify {
    #if a then b(); else c();
}
{
    // block
};

procedure_from_c :: (a1: s32, a2: s64, a3: int, a4: float) #foreign c_library {
};

some_proc : (a: int) -> string #foreign library;

main :: () {

    procedure_call(arg1, arg2);

    // Structs and parameterized structs

    struct_literal1 := TestStruct1.{};
    struct_literal2 := TestStruct2(69).{};

    //        Parameterized struct type
    struct1 : TestStruct2(420, 540, 999, "perhaps") = .{420, 540, 999, "perhaps"};

    //              Parameterized struct literal with named values
    call_expression(TestStruct2(s32).{var1=69,var2=420});

    //                                  This is supposed to be a parameterized struct, but a function
    //                                  call is also syntactically valid. Nothing I can do about that.
    type_arguments : TestStruct2(type = TestStruct2(type = s64));


    // procedures

    procedure_type : (int, int) -> int ;

    variable := procedure();

    // multiple variable declaration

    var1, var2 := 1, 2;
    const1, const2 :: 1, 2;

    var3, var4 : []string = .["", ""], string.["", ""];
    var5, var6 := procedure_call("declaration");
    var5, var6  = procedure_call("assignment");
    const3, const4 :: procedure_call("constant");

    // many more
    lets, try, even, more, variables := 1, 2, 3, 4, 5;
    lets, try, even, more, constants :: 1, 2, 3, 4, 5;
    // and assign/update
    lets, try, even, more, constants = 1, 2, 3, 4, 5;
    lets, try, even, more, constants += 1, 2, 3, 4, 5;

    some.big.member.expression = lol;

    pointer_type := *var1;

    {
        if condition
            do_stuff();
        else
            do_stuff();

        if condition
            do_stuff();
        more_stuff()

        if condition
            do_stuff();
        else
            do_more_stuff();

        if procedure_call("condition") == 1 // then
            print("consequence\n");
        else if condition
            print("consequence\n");
        else
            print("alternative\n");

        if condition {
            do_stuff();
            do_stuff();
        } else {
            do_stuff();
            do_stuff();
        }

        #if thing != null {
            print("");
            print("");
            print("");
        } else #if thing == .{} {
            print("");
            print("");
            print("");
        } else {
            print("");
            print("");
            print("");
        }


        if case_statement == {
        case 1; #through;
        case "pizza";
            do_stuff();
            #through;
        case 2;
            do_stuff();
        case;
        }
    }

    if 0 << << pointer_type  print();
    if x == 5 then print("x is 5.\n"); else print("x is not 5.\n");

    name := ifx thing then thing.name else "";

    mame := ifx thing then thing.name; // without else

    name := ifx thing {
        print("This is the true block.\n");
        factorial(5);
        thing.name;
    } else {
        print("We are about to get the default name.\n");
        x := 3;
        print("Really, it is going to happen.\n");
        get_default_name();
    }

    // big expressions inside if statement (this used to fail, should be fixed)
    if (member.expr * 2 + 1) * 100 < expr.again * another.expr {
        yes();
    } else {
        no();
    }

    if condition
        do_stuff();
    else if condition
        do_stuff();
    else
        do_stuff();

    if expr[index].member || expr[index].member {
        yes();
    } else {
        yes();
    }

    for * member.member.member {
        do_stuff();
    }

    for 0..1 {}
    for 0..count-1 {}

    for 0 .. 1 {}
    for 0 .. count-1 { }

    for member.expression..member.expression {
    }

    // there was an issue with parenthesised expressions with only an identifier inside
    call_expression(*member.expression, identifier + cast(type)(identifier));
    var := cast(type)(identifier);

    struct_literal := []u8.{data=null, count=0};

    array_literal := []u8.[10, 20, 30, 40];

    while member.call_expression(args) {}
    for member.call_expression(args) {}
    if member.call_expression(args) {}

    // quick procedures

    proc0 := x => proc_call();
    proc1 := (x,y) => proc_call();
    proc2 := (x,y) => {
        // block
        hello();
        return 0;
    };

    // parenthesised expression was conflicting with assignment_parameters
    (cast(#type (*void, s32) -> *void #c_call) function_pointer)(foo.bar, 1337);

    a : string = " \n// ";

    a :: #string END


        /**/

        /*
        */

aa
aaaa
        //
        

        
        //

    END;

} @notes_are_ignored @yes;
