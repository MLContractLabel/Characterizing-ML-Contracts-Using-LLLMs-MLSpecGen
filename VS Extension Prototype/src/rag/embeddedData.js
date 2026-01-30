// Embedded resource data (avoids file loading issues in bundled extension)
const kerasExamples = require('../../kerasembedded_examples.json');
const tensorflowExamples = require('../../Tensorembedded_examples.json');
const pytorchExamples = require('../../PytorchEmbedded_examples.json');
const scikitExamples = require('../../ScikitEmbedded_examples.json');

// Combine all library examples
const embeddedExamples = [
    ...kerasExamples,
    ...tensorflowExamples,
    ...pytorchExamples,
    ...scikitExamples
];

const researchContext = `ML Contract Violation Taxonomy

This document defines the taxonomy for classifying ML contract violations based on empirical analysis of Stack Overflow posts.

## Level 1: Central Contract Category

### SAM (Single API Method)
Contracts involving a single API method, typically focusing on preconditions and postconditions.
- Examples: Parameter validation, return type checking, input constraints
- Focus: Individual method behavior and constraints

### AMO (API Method Order)
Contracts that specify the required order of API method calls.
- Examples: fit() before predict(), compile() before fit()
- Focus: Temporal sequencing of method calls

### Hybrid
Combination of behavioral (SAM) and temporal (AMO) contracts.
- Examples: Method order with parameter validation
- Focus: Both individual method constraints and call sequencing

## Level 2: Contract Subcategories

### DT (Data Type)
Contracts related to the expected data types of API arguments.
- Examples: Tensor shape validation, dtype requirements
- Focus: Type system constraints

### BET (Boolean Expression Type)
Contracts involving boolean expressions or conditions on API arguments.
- Examples: Range validation, condition checking
- Focus: Logical constraints and conditions

### G (Always)
Temporal contracts that must always hold during execution.
- Examples: Invariant conditions, persistent state requirements
- Focus: Continuous validity requirements

### F (Eventually)
Temporal contracts that must hold at some point during execution.
- Examples: Eventual consistency, delayed validation
- Focus: Future state requirements

### SAI (Selection)
Contracts that involve selecting among multiple valid API usage patterns.
- Examples: Alternative parameter combinations, optional configurations
- Focus: Choice-based constraints

### SL (Selection)
Contracts that involve selecting among multiple valid API usage patterns.
- Examples: Alternative parameter combinations, optional configurations
- Focus: Choice-based constraints

## Level 3: Hybrid Patterns

### PT (Primitive Type)
Contracts expecting primitive data types (e.g., int, float, string).
- Examples: Integer ranges, float precision, string format
- Focus: Basic type constraints

### BIT (Built-in Type)
Contracts expecting built-in data structures (e.g., list, dict, tuple).
- Examples: List length, dictionary keys, tuple structure
- Focus: Container type constraints

### RT (Reference Type)
Contracts expecting references to objects or classes.
- Examples: Model instances, layer objects, optimizer references
- Focus: Object reference constraints

### MT (ML Type)
Contracts expecting machine learning-specific types (e.g., tensors, models).
- Examples: Tensor shapes, model architecture, layer compatibility
- Focus: ML-specific type constraints

### IC-1 (Intra-argument Contract)
Contracts involving conditions within a single API argument.
- Examples: Parameter value ranges, format validation
- Focus: Single parameter constraints

### IC-2 (Inter-argument Contract)
Contracts involving conditions between multiple API arguments.
- Examples: Shape compatibility, type matching, dependency validation
- Focus: Multi-parameter relationships

## Root Causes

### Unacceptable Input Type
The API receives an input of the wrong type.
- Examples: String instead of integer, wrong tensor dtype
- Impact: Type errors, runtime exceptions

### Unacceptable Input Value
The API receives an input of the correct type but invalid value.
- Examples: Negative dimensions, invalid ranges, malformed data
- Impact: Logic errors, unexpected behavior

### Missing Options
Required optional parameters are not provided.
- Examples: Missing activation function, unspecified optimizer
- Impact: Default behavior, potential issues

### Missing Input Value/Type Dependency
Input values depend on other inputs but dependency is not satisfied.
- Examples: Shape mismatch, type incompatibility
- Impact: Runtime errors, data corruption

### Missing Input value-Method order Dependency
Input values depend on method call order but order is incorrect.
- Examples: Using uninitialized variables, calling methods out of sequence
- Impact: State errors, undefined behavior

### Missing Required Method Order
Methods must be called in a specific order but order is violated.
- Examples: fit() before predict(), compile() before fit()
- Impact: State errors, functionality failures

### Missing Required State-specific Method Order
Methods must be called in order based on current state but state is incorrect.
- Examples: Training vs inference mode, model state dependencies
- Impact: Mode errors, incorrect behavior

## Effects

### Crash
The program terminates unexpectedly due to an exception.
- Examples: RuntimeError, ValueError, TypeError
- Impact: Complete failure, data loss

### IF (Incorrect Functionality)
The program runs but produces incorrect results.
- Examples: Wrong predictions, incorrect calculations
- Impact: Silent failures, unreliable output

### BP (Bad Performance)
The program runs but with degraded performance.
- Examples: Slow execution, memory issues, inefficient operations
- Impact: Resource waste, poor user experience

### MOB (Model Output Bias)
The model produces biased or skewed outputs.
- Examples: Unequal accuracy across classes, systematic errors
- Impact: Unfair results, reduced model quality

### Unknown
The effect cannot be determined from the available information.
- Examples: Insufficient context, unclear error messages
- Impact: Difficult debugging, uncertain outcomes

## Contract Violation Locations

### Model Construction
Violations occurring during model architecture definition.
- Examples: Layer configuration, architecture setup
- Focus: Model structure and design

### Train
Violations occurring during model training.
- Examples: Training loop, optimization, data feeding
- Focus: Learning process and optimization

### Model Evaluation
Violations occurring during model testing and validation.
- Examples: Test data processing, metric calculation
- Focus: Performance assessment

### Data Preprocessing
Violations occurring during data preparation.
- Examples: Data cleaning, transformation, normalization
- Focus: Input data preparation

### Prediction
Violations occurring during model inference.
- Examples: Input validation, output processing
- Focus: Inference and prediction

### Load
Violations occurring during model loading and deserialization.
- Examples: File loading, model restoration
- Focus: Model persistence

### Model Initialization
Violations occurring during model instantiation.
- Examples: Constructor calls, parameter setup
- Focus: Model creation and setup

## Detection Techniques

### Static
Violations that can be detected without executing the code.
- Examples: Type checking, syntax analysis, static analysis
- Focus: Compile-time detection

### Runtime Checking
Violations that require code execution to detect.
- Examples: Dynamic analysis, execution monitoring, runtime validation
- Focus: Execution-time detection

## Reasons for Labeling

### NA (Not Applicable)
The post does not contain ML contract violations.
- Examples: General programming questions, non-ML topics
- Focus: Non-relevant content

### NI (Not Informative)
The post lacks sufficient information to determine violations.
- Examples: Incomplete code, unclear descriptions
- Focus: Insufficient context

### IM (Insufficient ML Context)
The post involves ML but lacks contract-specific information.
- Examples: General ML questions, theoretical discussions
- Focus: Limited contract relevance

## Usage Guidelines

1. **Level 1**: Choose only one best-fitting label (SAM, AMO, or Hybrid)
2. **Level 2**: Choose only one best-fitting label (DT, BET, G, F, SAI, or SL)
3. **Level 3**: You may return multiple labels if appropriate, separated by commas
4. **Leaf Contract Category**: Should match Level 3 — one or more values
5. **Root Cause**: Choose the most specific applicable cause
6. **Effect**: Choose the most likely outcome of the violation
7. **Contract Violation Location**: Choose the most relevant pipeline stage
8. **Detection Technique**: Choose based on how the violation would be detected
9. **Reasons for Labeling**: Provide clear explanation for the classification

## Examples

### Example 1: Shape Mismatch
- **Level 1**: SAM (Single API Method)
- **Level 2**: DT (Data Type)
- **Level 3**: MT (ML Type)
- **Root Cause**: Unacceptable Input Value
- **Effect**: Crash
- **Location**: Model Evaluation
- **Detection**: Runtime Checking

### Example 2: Missing fit() Call
- **Level 1**: AMO (API Method Order)
- **Level 2**: G (Always)
- **Level 3**: IC-2 (Inter-argument Contract)
- **Root Cause**: Missing Required Method Order
- **Effect**: Crash
- **Location**: Prediction
- **Detection**: Runtime Checking

### Example 3: Parameter Validation
- **Level 1**: SAM (Single API Method)
- **Level 2**: BET (Boolean Expression Type)
- **Level 3**: PT (Primitive Type)
- **Root Cause**: Unacceptable Input Value
- **Effect**: IF (Incorrect Functionality)
- **Location**: Model Construction
- **Detection**: Static`;

const actionableExamples = `RQ1: Most frequent contracts for ML APIs (§3.1.1)
Finding:
1. Constraint check on single arguments of an API.
2. Order of API calls that become a requirement eventually.
Actionable Insight:
This is good news because the software engineering (SE) community can employ existing contract mining approaches to also mine contracts for ML APIs. However, there might be a need to combine behavioral and temporal contract mining approaches that have been independently developed thus far.

---

RQ4: ML API contracts that are commonly violated occur in earlier ML pipeline stages (§3.4)
Finding:
ML API contract violations happen mostly in earlier phases of ML pipelines.
Actionable Insight:
A verification system with ML contract knowledge can explain whether a bug in the ML system that used those APIs stemmed from an API contract breach.

---

RQ3: The absence of precise error messages (§3.1.2)
Finding:
System failures lead to imprecise error messages, making contract comprehension and violation detection more challenging.
Actionable Insight:
Since domain experts can understand the challenging ML contracts (§3.3), encoding this knowledge as contracts can enable improved debugging mechanisms.

---

RQ1: ML APIs require several type checking contracts and interdependency between behavioral and temporal contracts (§3.1.1 and Table 6)
Finding:
ML APIs require special type-checking and behavioral-temporal interdependent contracts.
Actionable Insight:
Programming methodology and tools for design-by-contract should include sufficient expressiveness to handle these additional types of contracts seen in ML APIs.

An example of an IC-1 contract is given in SO post 6, which shows an ML
API users trying to use the TensorFlow API random_shuffle() to shuffle a
Tensor, a, with some set seed value. One of the solutions mentioned in the
accepted answer says that to do that, one should specify the argument seed
with the desired value, e.g., the argument seed gets the value 42. The root
cause of this contract violation is that acceptable input value is not supplied
to (the random_shuffle()) method.
Inter-argument contracts (IC-2): IC-2 contracts involve more than one
argument to an API method, possibly using comparisons or logical expressions.
For example, in SO post 4, the matmul() API from TensorFlow requires that
the type of the second argument should match the type of the first argument.
A comparison expression can express this contract, so it belongs to IC-2. The
root cause of this contract violation is that the (matmul()) API is missing
input value/type dependency between arguments. Another example 7
for this category is nn.softmax_cross_entropy_with_logits(), an API from
TensorFlow, which requires that the logits and labels arguments must have the same shape (i.e., [batch_size, num_classes])

Eventually (F): Eventually contracts are AMO contracts where the ordering`;

const pycontractsDoc = `# PyContracts Documentation (for LLM Context)

Introduction to PyContracts
PyContracts is a Python package that allows to declare constraints on function parameters and return values. It supports a basic type system, variables binding, arithmetic constraints, and has several specialized contracts (notably for Numpy arrays).

As a quick intro, please see this presentation about PyContracts.

A presentation about PyContracts
Why: The purpose of PyContracts is not to turn Python into a statically-typed language (albeit you can be as strict as you wish), but, rather, to avoid the time-consuming and obfuscating checking of various preconditions. In fact, more than the type constraints, I found useful the ability to impose value and size constraints. For example, "I need a list of at least 3 positive numbers" can be expressed as list[>=3](number, >0)). If you find that PyContracts is overkill for you, you might want to try a simpler alternative, such as typecheck. If you find that PyContracts is not enough for you, you probably want to be using Haskell instead of Python.

Specifying contracts: Contracts can be specified in three ways:

Using the \`\`@contract\`\` decorator:

@contract(a='int,>0', b='list[N],N>0', returns='list[N]')
def my_function(a, b):
    ...

Using annotations (for Python 3):

@contract
def my_function(a : 'int,>0', b : 'list[N],N>0') -> 'list[N]':
     # Requires b to be a nonempty list, and the return
     # value to have the same length.
     ...

Using docstrings, with the :type: and :rtype: tags:

@contract
def my_function(a, b):
    """ Function description.
        :type a: int,>0
        :type b: list[N],N>0
        :rtype: list[N]
    """
    ...

Deployment: In production, all checks can be disabled using the function contracts.disable_all(), so the performance hit is 0.

Extensions: You can extend PyContracts with new contracts types:

new_contract('valid_name', lambda s: isinstance(s, str) and len(s)>0)
@contract(names='dict(int: (valid_name, int))')
def process_accounting(records):
    ...

Any Python type is a contract:

@contract(a=int, # simple contract
          b='int,>0' # more complicated
          )
def f(a, b):
    ...

Enforcing interfaces: ContractsMeta is a metaclass, like ABCMeta, which propagates contracts to the subclasses:

from contracts import contract, ContractsMeta, with_metaclass

class Base(with_metaclass(ContractsMeta, object)):

    @abstractmethod
    @contract(probability='float,>=0,<=1')
    def sample(self, probability):
        pass

class Derived(Base):
    # The contract above is automatically enforced,
    # without this class having to know about PyContracts at all!
    def sample(self, probability):
        ....

Numpy: There is special support for Numpy:

@contract(image='array[HxWx3](uint8),H>10,W>10')
def recolor(image):
    ...

Quick tour
The contracts are specified using the type clause of RST-style docstrings (now accepted as standard in the python libraries); or, they can be passed explicitly to the @contract decorator. In this example, PyContracts is smart enough to check that the two parameters a and b are matrices of compatible dimensions. Then, it checks that the result value is of compatible dimensions as well.

import numpy
from contracts import contract

@contract
def matrix_multiply(a,  b):
    ''' Multiplies two matrices together.

        :param a: The first matrix. Must be a 2D array.
         :type a: array[MxN],M>0,N>0

        :param b: The second matrix. Must be of compatible dimensions.
         :type b: array[NxP],P>0

          :rtype: array[MxP]
    '''
    return numpy.dot(a, b)

PyContracts can come in handy when you have operations that could be one-liners if you are sure of the types of the parameters, but doing all the checking adds to the complexity of the code.

In the next example we check that:

The two lists have elements of the same type (indicated by the variable x);

The returned list has the correct size (the sum of the two lengths).

@contract(      a='list[ M ](type(x))',
                 b='list[ N ](type(x))',
           returns='list[M+N](type(x))')
def my_cat_equal(a, b):
    ''' Concatenate two lists together. '''
    return a + b

The philosophy is to make the simple cases easy, and the difficult possible, while still retaining readability.

For example, we can either ask for a simple list, or specify more about it using the additional clauses.

Contract expression	Meaning
list	          An instance of list.
list[2]	          A list of two elements.
list(int)	  A list of integers.
list(number)	  A list of numbers.
list[3](number)	  A list of exactly three numbers.
list[>=3](number)	A list of at least three numbers.
list[>=3](number, >0)	A list of at least three numbers, greater than 0.

PyContracts supports the use of variables. There are two kinds of variables: lower-case letters (a, b, …) are general-purpose variables, while upper-case letters (A, B, …) are constrained to bind to integer types; they are meant to represent sizes and shapes. Moreover, PyContracts can do arithmetic and comparisons.

Contract expression	Meaning
tuple(list[N], list[N])	A tuple with two lists of the same length.
tuple(list[N], list[M]), N<M	A tuple with two lists, the first one being shorter.
list[>0](type(x))	A non-empty list containing elements of all the same type.
tuple(list(type(x)), list(type(x)))	A tuple with two lists containing objects of the same type.

API for specifying contracts
This is a discussion of the PyContracts API.

See contracts for a detailed list of this module's public interface.
See Language reference for a description of the domain specific language used to describe the contracts.
Using the @contract decorator.
The decorator contracts() is the main way to define constraints. It is quite flexible, and it is smart enough to support functions with variable number of arguments and keyword arguments.

There are three ways to specify the contracts. In order of precedence:

As arguments to this decorator.
As Python 3 function annotations.
Using :type: and :rtype: tags in the function's docstring.
PyContracts will try these options in order. Note that, in any case, only one of these options are chosen. For example, you cannot use both annotations and docstring for the same function: if annotations are found, the docstring is not considered.

Using decorator arguments
contract() accepts a list of keyword arguments. Each keyword should correspond to one function argument, plus the special name returns is reserved for describing the return value. An example use would be:

from contracts import contract

@contract(a='int,>0', b='list[N],N>0', returns='list[N]')
def my_function(a, b):
    ...

The values can be either:

Strings using PyContracts' DSL language (see Language reference)

Python types — in this case PyContracts will do a simple isinstance() check. This is slightly more clear if the contract is simple:

@contract(a=int, b=float, returns=float)
def my_function(a, b):
    return a + b

Using Python annotations
The same rules apply. In this case the syntax would look like this:

from contracts import contract

@contract
def my_function(a:'int,>0', b:'list[N],N>0') -> 'list[N]':
    ...

Using functions docstrings
The Python standard library seems to have standardized on the :param:, :type:, :return:, :rtype: tags to document functions, and tools like Sphinx can interpret those tags to produce pretty documentation.

PyContracts can read contracts declared using the :type: and :rtype: tags. In this way, your function becomes automatically more robust and better documented.

Here is an example use:

from contracts import contract

@contract
def my_function(a, b):
  """ Function description.

      :param a: first number
      :type a: int,>0
      :param b: description of b
      :type b: list[N],N>0

      :return: a list
      :rtype: list[N]               """
  ...

Note By convention, those annotations must be parsable as reStructuredText. If the contract string has special RST characters in it, like *, you can include it in double ticks. PyContracts will remove the double ticks before interpreting the string.
For example, the two annotations in this docstring are equivalent for PyContracts, but the latter is better for Sphinx:

""" My function

    :param a: First parameter
    :type a: list(tuple(str,*))

    :param b: First parameter
    :type b: \`\`list(tuple(str,*))\`\`
"""

Using the ContractsMeta meta-class
The ContractsMeta meta-class can be used as a drop-in replacement for ABCMeta. It allows you to declare contracts for a superclass and then have those contracts automatically enforced for any class that derives from it.

For example, let us define a "timer" interface whose start method requires a positive number:

from contracts import ContractsMeta, contract
from abc import abstractmethod

class TimerInterface():
    __metaclass__ = ContractsMeta

    @abstractmethod
    @contract(interval='(float|int),>0')
    def start(self, interval):
        pass

Now we can subclass TimerInterface and all contracts will be automatically inherited:

class Timer(TimerInterface):

    def start(self, interval):
        time.sleep()


t = Timer()
t.start(-1) # raises ContractNotRespected

# contracts.interface.ContractNotRespected: Breach for argument 'interval' to Timer:start().
# Condition -1 >= 0 not respected
# checking: >=0               for value: Instance of int: -1
# checking: (float|int),>=0   for value: Instance of int: -1

Creating new contracts using new_contract
The function new_contract() is used to define new contracts. It takes two arguments. The first argument is the name of the new contract, and the second is the value:

new_contract('color', 'list[3](float)')
Once defined, the new contracts can be used as part of more complicated expressions:

@contract(colors='list(color)')
def average_colors(colors):
    pass

The second parameter to new_contract can be either a string, a Python type, or a callable function.

If it is a string or a type, it is interpreted as contract expression like any parameter to @contract().

If it is a callable, it must accept one parameter, and either:

return True or None, to signify it accepts.
return False or raise ValueError, to signify it doesn't.
If ValueError is raised, its message is used in the error.

This function returns a Contract object. It might be useful to check right away if the declaration is what you meant, using Contract.check() and Contract.fail().

For example, suppose that you are writing a graphical application and that many of your functions need arguments representing colors. It might be a good idea to declare once and for all what is a color, and then reuse that definition. For example:

color = new_contract('color', 'list[3](number,>=0,<=1)')
# Make sure we got it right
color.check([0,0,0])
color.check([0,0,1])
color.fail([0,0])
color.fail([0,0,2])

# Now use \`\`color\`\` in other contracts.
@contract
def fill_area(inside, border):
    """ Fill the area inside the current figure.

        :type border: color
        :type inside: color              """
    ...

@contract
def fill_gradient(colors):
    """ Use a gradient to fill the area.

        :type colors: list[>=2](color)     """
    ...`;

const pycontractsDeep = `DEEP LEARNING CONTRACTS

In the DL Contract approach, we abstract the data properties, expected output, model architecture, and training behavior of a DNN model and specify the properties of DL APIs connected via a computation graph. We gather and inspect necessary conditions from three sources (details in §4.1). We filter out the obligations from the DL app developer as preconditions and expectations from DL software as postconditions. Here, we use a novel runtime assertion check in DL computation. The contract checker modules first parse those contracts and translate them into templates. Those templates are validated to handle exceptions if they occur. If a contract is violated, the user receives a contract violation message. Otherwise, the API returns the normal execution output. Thus, our proposed solution generalizes to other bugs and model categories. It would be easy for library developers to specify the contracts for other types of bugs following these procedures of DL Contract.

Next, we present the design and usage of DL Contract, including examples and our approach for abstracting DL-related properties.


3.1 Writing Deep Learning Contract

DL Contract uses an annotation-based approach to add contracts to DL APIs, which allows library developers to add contracts without modifying compilers and build tools. This means that software using DL APIs does not need to be modified. DL library developers can add preconditions that must be satisfied before the API is called and postconditions that the API guarantees to be true upon completion.


3.1.1 Syntax

To use contracts in a deep learning library, it is necessary to annotate the API with @contract and @new_contract. This allows library developers to create expressions for checking specified contracts. DL Contract can check types such as tensors and model objects, as well as simple data types like strings, floats, numbers, arrays, and booleans. It utilizes logical operators like AND (,) and OR (|) and allows for arithmetic and comparison expressions. Additionally, DL Contract can be used to check constraints of various model properties during training and abstraction.


3.1.2 Illustrative Example

To create a contract, a library developer annotates a DL API using @contract and @new_contract. Inside @contract, the developer defines types and functions for checking contracts. Using @new_contract, the developer writes functions for performing computations necessary for a contract and for checking preconditions and postconditions.

For instance, in Example 3.1, a contract is imposed as a precondition on the Keras training function fit to ensure that data is within a specified range before training.


Example 3.1: A Contract on Fit API inside Keras Library

 1 @new_contract
 2 def data_normalization(x):
 3     normalization_interval = np.max(x) - np.min(x)
 4     if normalization_interval > 2.0:
 5         msg = "Data should be normalized before training, train and test data should be divided by value " + str(np.max(x))
 6         raise ContractException(msg)
 7 
 8 @contract(x='data_normalization')
 9 def fit(self, x=None, y=None, ...):
10     pass

When a buggy DL program makes use of this annotated API, DL Contract will throw the following error:

ContractViolated: Data should be normalized before training, train and test data should be divided by value 255.0.


Example 3.2: Preventing Overfitting Bugs

 1 @new_contract
 2 def overfitting(history):
 3     i = 0
 4     while i <= (len(history.epoch) - 2):
 5         epochNo = i + 2
 6         diff_loss = history['loss'][i + 1] - history['loss'][i]
 7         diff_val_loss = history['val_loss'][i + 1] - history['val_loss'][i]
 8         i += 1
 9         if diff_val_loss > 0.0:
10             if diff_loss <= 0.0:
11                 msg = "After Epoch " + str(epochNo) + ", diff_val_loss = " + str('%.4f' % diff_val_loss) + " and diff_loss = " + str('%.4f' % diff_loss) + " causes overfitting"
12                 raise ContractException(msg)
13 
14 @contract(returns='overfitting')
15 def fit(self, x=None, y=None, ...): 
16     return self.history

When this contract is violated, DL Contract throws:

ContractViolated: After Epoch: 11, diff_val_loss = 0.34 and diff_loss = -0.12 causes overfitting.


Contextualized Inter-API Call Contracts

The next challenge is to ensure that DL Contracts can be written involving multiple APIs at different stages of the DL pipeline. To solve this problem, DL Contract is designed to write multiple functions using @new_contract annotations that take formal parameters across multiple DL APIs.

For example, when the number of target classes is 2 (i.e., binary classification), the activation function of the last layer should not be softmax or relu, and the loss function should be 'binary_crossentropy'.

Although the best activation for hidden layers is ReLU, using ReLU in the last layer will zero out negative outputs, causing accuracy issues. To prevent this, DL Contract can enforce contracts on both the activation function and the loss function.


Example 3.3: Last Layer Activation and Loss Function Contract

 1 @new_contract
 2 def contract_checkerfunc1(model):
 3     last_layer_output = int(str((model.layers[len(model.layers) - 1]).output_shape).split(',').pop(-1).strip(')'))
 4     activation_func = str(model.layers[len(model.layers) - 1].__getattribute__('activation')).split()[1]
 5     if last_layer_output >= 3:
 6         if activation_func not in 'softmax':
 7             msg1 = 'For multiclass classification activation_func should be softmax'
 8             raise ContractException(msg1)
 9 
10 @new_contract
11 def contract_checkerfunc2(loss):
12     if loss not in 'categorical_crossentropy':
13         msg2 = 'loss should be categorical crossentropy'
14         raise ContractException(msg2)
15 
16 @contract(self='model,contract_checkerfunc1')
17 @contract(loss='str,contract_checkerfunc2')
18 def compile(self, optimizer='rmsprop', loss=None, metrics=None, ...):
19     pass

When this contract is violated:

ContractViolated: For multiclass classification activation_func should be softmax, loss should be categorical crossentropy.`;

module.exports = {
    embeddedExamples,
    researchContext,
    actionableExamples,
    pycontractsDoc,
    pycontractsDeep
};

