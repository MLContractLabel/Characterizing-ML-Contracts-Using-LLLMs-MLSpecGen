import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D  # [REPLACED] Convolution2D -> Conv2D (deprecated in newer Keras)
from tensorflow.keras.callbacks import ModelCheckpoint
from contracts import contract

# Create synthetic data for demonstration
np.random.seed(42)
train_dataset = np.random.rand(100, 32, 32, 1)
train_labels = np.random.randint(0, 2, size=(100, 1))
valid_dataset = np.random.rand(20, 32, 32, 1)
valid_labels = np.random.randint(0, 2, size=(20, 1))

# Contract for Convolution2D/Conv2D input_shape
@contract(input_shape='tuple|list|array,N>0,N<4')
def conv2d_with_input_shape(filters, kernel_size, padding='valid', input_shape=None, **kwargs):
    """Wrapper around Conv2D that enforces correct input_shape dimensionality.
    
    The input_shape should only include feature dimensions (height, width, channels),
    not the batch dimension. Keras will add the batch dimension automatically.
    """
    if isinstance(kernel_size, int):
        kernel_size = (kernel_size, kernel_size)
    
    return Conv2D(
        filters=filters,
        kernel_size=kernel_size,
        padding=padding,  # [REPLACED] border_mode -> padding (renamed in newer Keras)
        input_shape=input_shape,
        **kwargs
    )

def create_model(input_shape):
    model = Sequential()
    
    # Bug: input_shape includes batch dimension, making it 4D instead of 3D
    model.add(conv2d_with_input_shape(16, 5, padding='same', input_shape=input_shape))
    
    # Simplified model for demonstration
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model

if __name__ == "__main__":
    # The bug: including batch dimension in input_shape
    input_shape = (100, 32, 32, 1)  # Wrong: includes batch dimension
    
    # Create model with incorrect input shape
    model = create_model(input_shape)
    
    # Set up callbacks
    model_callbacks = [ModelCheckpoint('model_checkpoint.h5', save_best_only=True)]
    
    # This would fail in original code, but our contract will catch it first
    model.fit(
        train_dataset, train_labels,
        epochs=1,  # [REPLACED] nb_epoch -> epochs (renamed in newer Keras)
        verbose=1,
        validation_data=(valid_dataset, valid_labels),
        callbacks=model_callbacks
    )