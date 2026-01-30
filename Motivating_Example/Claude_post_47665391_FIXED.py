import numpy as np
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, Flatten, Dense
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
        padding=padding,
        input_shape=input_shape,
        **kwargs
    )


def create_model(input_shape):
    model = Sequential()
    
    # Fixed: input_shape only includes feature dimensions (H,W,C)
    model.add(conv2d_with_input_shape(16, 5, padding='same', input_shape=input_shape))
    model.add(Flatten())  # Added to flatten Conv2D output
    model.add(Dense(1, activation='sigmoid'))  # Added for binary classification
    
    model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    return model


if __name__ == "__main__":
    # Fixed: input_shape only includes feature dimensions (H,W,C)
    input_shape = (32, 32, 1)  # Correct: only includes feature dimensions
    
    # Create model with correct input shape
    model = create_model(input_shape)
    
    # Set up callbacks
    model_callbacks = [ModelCheckpoint('model_checkpoint.h5', save_best_only=True)]
    
    # This will now work correctly
    model.fit(
        train_dataset, train_labels,
        epochs=1,
        verbose=1,
        validation_data=(valid_dataset, valid_labels),
        callbacks=model_callbacks
    )
    print("Training completed successfully!")
