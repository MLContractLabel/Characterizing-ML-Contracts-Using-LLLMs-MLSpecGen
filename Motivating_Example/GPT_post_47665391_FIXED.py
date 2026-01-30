import numpy as np
try:
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Conv2D
except Exception:
    from keras.models import Sequential
    from keras.layers import Conv2D

from contracts import contract, new_contract
new_contract('posint', lambda n: isinstance(n, int) and n > 0)

@contract(input_shape='tuple(posint,posint,posint)')
def create_model(input_shape):
    model = Sequential()
    model.add(Conv2D(16, (5, 5), padding='same', input_shape=input_shape))
    return model

if __name__ == "__main__":
    # RIGHT: H, W, C (no batch dim)
    input_shape = (32, 32, 1)
    create_model(input_shape)
