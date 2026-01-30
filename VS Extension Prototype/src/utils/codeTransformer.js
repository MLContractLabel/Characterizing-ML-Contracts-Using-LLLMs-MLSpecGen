/**
 * Code Transformer Utility
 * Transforms deprecated/incompatible APIs to compatible versions
 */

class CodeTransformer {
    constructor() {
        // Define API replacements for TensorFlow 2.10.0 compatibility
        this.apiReplacements = [
            // TensorFlow 1.x -> 2.x compatibility
            {
                pattern: /tf\.Session\(\)/g,
                replacement: 'tf.compat.v1.Session()',
                comment: '# [AUTO-REPLACED] tf.Session() -> tf.compat.v1.Session() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.placeholder\(/g,
                replacement: 'tf.compat.v1.placeholder(',
                comment: '# [AUTO-REPLACED] tf.placeholder() -> tf.compat.v1.placeholder() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.global_variables_initializer\(\)/g,
                replacement: 'tf.compat.v1.global_variables_initializer()',
                comment: '# [AUTO-REPLACED] tf.global_variables_initializer() -> tf.compat.v1.global_variables_initializer() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.initialize_all_variables\(\)/g,
                replacement: 'tf.compat.v1.global_variables_initializer()',
                comment: '# [AUTO-REPLACED] tf.initialize_all_variables() -> tf.compat.v1.global_variables_initializer() (deprecated)'
            },
            {
                pattern: /tf\.local_variables_initializer\(\)/g,
                replacement: 'tf.compat.v1.local_variables_initializer()',
                comment: '# [AUTO-REPLACED] tf.local_variables_initializer() -> tf.compat.v1.local_variables_initializer() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.train\.Saver\(\)/g,
                replacement: 'tf.compat.v1.train.Saver()',
                comment: '# [AUTO-REPLACED] tf.train.Saver() -> tf.compat.v1.train.Saver() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.variable_scope\(/g,
                replacement: 'tf.compat.v1.variable_scope(',
                comment: '# [AUTO-REPLACED] tf.variable_scope() -> tf.compat.v1.variable_scope() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.get_variable\(/g,
                replacement: 'tf.compat.v1.get_variable(',
                comment: '# [AUTO-REPLACED] tf.get_variable() -> tf.compat.v1.get_variable() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.AUTO_REUSE/g,
                replacement: 'tf.compat.v1.AUTO_REUSE',
                comment: '# [AUTO-REPLACED] tf.AUTO_REUSE -> tf.compat.v1.AUTO_REUSE (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.train\.string_input_producer\(/g,
                replacement: 'tf.compat.v1.train.string_input_producer(',
                comment: '# [AUTO-REPLACED] tf.train.string_input_producer() -> tf.compat.v1.train.string_input_producer() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.train\.shuffle_batch\(/g,
                replacement: 'tf.compat.v1.train.shuffle_batch(',
                comment: '# [AUTO-REPLACED] tf.train.shuffle_batch() -> tf.compat.v1.train.shuffle_batch() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.train\.Coordinator\(\)/g,
                replacement: 'tf.compat.v1.train.Coordinator()',
                comment: '# [AUTO-REPLACED] tf.train.Coordinator() -> tf.compat.v1.train.Coordinator() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.train\.start_queue_runners\(/g,
                replacement: 'tf.compat.v1.train.start_queue_runners(',
                comment: '# [AUTO-REPLACED] tf.train.start_queue_runners() -> tf.compat.v1.train.start_queue_runners() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.TextLineReader\(/g,
                replacement: 'tf.compat.v1.TextLineReader(',
                comment: '# [AUTO-REPLACED] tf.TextLineReader() -> tf.compat.v1.TextLineReader() (TF 2.x compatibility)'
            },
            {
                pattern: /tf\.decode_csv\(/g,
                replacement: 'tf.compat.v1.decode_csv(',
                comment: '# [AUTO-REPLACED] tf.decode_csv() -> tf.compat.v1.decode_csv() (TF 2.x compatibility)'
            },
            
            // NumPy compatibility (for NumPy 1.21.6)
            {
                pattern: /np\.int\(/g,
                replacement: 'np.int32(',
                comment: '# [AUTO-REPLACED] np.int() -> np.int32() (NumPy 1.21+ compatibility)'
            },
            {
                pattern: /np\.float\(/g,
                replacement: 'np.float32(',
                comment: '# [AUTO-REPLACED] np.float() -> np.float32() (NumPy 1.21+ compatibility)'
            },
            {
                pattern: /np\.bool\(/g,
                replacement: 'np.bool_(',
                comment: '# [AUTO-REPLACED] np.bool() -> np.bool_() (NumPy 1.21+ compatibility)'
            },
            
            // TensorFlow random functions
            {
                pattern: /tf\.random\.normal\(/g,
                replacement: 'tf.random.normal(',
                comment: '# [AUTO-REPLACED] tf.random.normal() (already compatible)'
            },
            {
                pattern: /tf\.random_normal\(/g,
                replacement: 'tf.random.normal(',
                comment: '# [AUTO-REPLACED] tf.random_normal() -> tf.random.normal() (TF 2.x API)'
            },
            {
                pattern: /tf\.random\.uniform\(/g,
                replacement: 'tf.random.uniform(',
                comment: '# [AUTO-REPLACED] tf.random.uniform() (already compatible)'
            },
            {
                pattern: /tf\.random_uniform\(/g,
                replacement: 'tf.random.uniform(',
                comment: '# [AUTO-REPLACED] tf.random_uniform() -> tf.random.uniform() (TF 2.x API)'
            },
            
            // Keras compatibility
            {
                pattern: /from keras\./g,
                replacement: 'from tensorflow.keras.',
                comment: '# [AUTO-REPLACED] from keras.* -> from tensorflow.keras.* (TF 2.x compatibility)'
            },
            {
                pattern: /import keras/g,
                replacement: 'import tensorflow.keras as keras',
                comment: '# [AUTO-REPLACED] import keras -> import tensorflow.keras as keras (TF 2.x compatibility)'
            }
        ];
        
        // Patterns that require disabling eager execution (must be at top of file)
        this.requiresEagerDisable = [
            /tf\.Session\(/,
            /tf\.placeholder\(/,
            /tf\.compat\.v1\.Session\(/,
            /tf\.compat\.v1\.placeholder\(/
        ];
    }

    /**
     * Transform code to use compatible API versions
     * @param {string} code - Original code
     * @param {Object} options - Transformation options
     * @returns {Object} - { transformedCode, replacements: [{original, replacement, comment}] }
     */
    transformCode(code, options = {}) {
        const {
            addEagerDisable = true,  // Add tf.compat.v1.disable_eager_execution() if needed
            addCollectionsFix = true, // Add collections.abc compatibility fix
            trackReplacements = true  // Track what was replaced
        } = options;

        let transformedCode = code;
        const replacements = [];
        let needsEagerDisable = false;

        if (addEagerDisable) {
            needsEagerDisable = this.requiresEagerDisable.some(pattern => pattern.test(code));
            
            // Only add if not already present
            if (needsEagerDisable && !code.includes('disable_eager_execution')) {
                // Find the import tensorflow line
                const tfImportMatch = code.match(/^(import tensorflow|from tensorflow import)/m);
                if (tfImportMatch) {
                    const insertPos = code.indexOf(tfImportMatch[0]) + tfImportMatch[0].length;
                    const eagerDisable = '\nimport tensorflow as tf\ntf.compat.v1.disable_eager_execution()\n';
                    transformedCode = code.substring(0, insertPos) + '\n' + eagerDisable + code.substring(insertPos);
                    
                    if (trackReplacements) {
                        replacements.push({
                            original: 'tf imports',
                            replacement: 'Added tf.compat.v1.disable_eager_execution()',
                            comment: '# [AUTO-REPLACED] Added disable_eager_execution() for graph mode compatibility'
                        });
                    }
                }
            }
        }

        // Apply API replacements
        for (const replacement of this.apiReplacements) {
            if (replacement.pattern.test(transformedCode)) {
                const matches = transformedCode.match(replacement.pattern);
                if (matches) {
                    transformedCode = transformedCode.replace(replacement.pattern, replacement.replacement);
                    
                    if (trackReplacements) {
                        replacements.push({
                            original: matches[0],
                            replacement: replacement.replacement,
                            comment: replacement.comment
                        });
                    }
                }
            }
        }

        // Add collections.abc compatibility fix if needed
        if (addCollectionsFix && !code.includes('collections.abc')) {
            const collectionsFix = `# Apply collections compatibility fix for PyContracts
import collections
import collections.abc

# Apply compatibility patches for PyContracts
try:
    collections.Container = collections.abc.Container
    collections.Iterable = collections.abc.Iterable
    collections.Iterator = collections.abc.Iterator
    collections.Callable = collections.abc.Callable
    collections.Mapping = collections.abc.Mapping
    collections.MutableMapping = collections.abc.MutableMapping
    collections.Sequence = collections.abc.Sequence
    collections.MutableSequence = collections.abc.MutableSequence
    collections.Set = collections.abc.Set
    collections.MutableSet = collections.abc.MutableSet
    collections.Hashable = collections.abc.Hashable
    collections.Sized = collections.abc.Sized
except AttributeError:
    pass

`;
            
            // Insert after imports but before other code
            const importEnd = transformedCode.lastIndexOf('import ') !== -1 
                ? transformedCode.lastIndexOf('\n', transformedCode.lastIndexOf('import ')) + 1
                : 0;
            
            transformedCode = transformedCode.substring(0, importEnd) + 
                            collectionsFix + 
                            transformedCode.substring(importEnd);
            
            if (trackReplacements) {
                replacements.push({
                    original: 'imports',
                    replacement: 'Added collections.abc compatibility fix',
                    comment: '# [AUTO-REPLACED] Added collections.abc compatibility for PyContracts'
                });
            }
        }

        return {
            transformedCode,
            replacements,
            wasTransformed: replacements.length > 0
        };
    }

    /**
     * Check if code needs transformation
     * @param {string} code - Code to check
     * @returns {boolean} - True if transformation is needed
     */
    needsTransformation(code) {
        for (const replacement of this.apiReplacements) {
            if (replacement.pattern.test(code)) {
                return true;
            }
        }
        
        if (this.requiresEagerDisable.some(pattern => pattern.test(code))) {
            if (!code.includes('disable_eager_execution')) {
                return true;
            }
        }
        
        return false;
    }
}

module.exports = CodeTransformer;

