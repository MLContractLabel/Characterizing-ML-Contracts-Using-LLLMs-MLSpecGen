import numpy as np
try:
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import Conv2D
except Exception:
    from keras.models import Sequential
    from keras.layers import Conv2D

from contracts import contract, new_contract, ContractNotRespected
new_contract('posint', lambda n: isinstance(n, int) and n > 0)

@contract(input_shape='tuple(posint,posint,posint)')
def create_model(input_shape):
    model = Sequential()
    model.add(Conv2D(16, (5, 5), padding='same', input_shape=input_shape))
    return model

if __name__ == "__main__":
    # WRONG: includes batch dim (4-length tuple)
    input_shape = (26721, 32, 32, 1)
    try:
        create_model(input_shape)
    except ContractNotRespected as e:
        print("[PyContract VIOLATION caught as expected]", e)
