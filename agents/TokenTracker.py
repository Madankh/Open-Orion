import tiktoken

class LocalTokenizer:
    def __init__(self, model_name="gpt-4"):
        self.encoding = tiktoken.encoding_for_model(model_name)

    def count_tokens(self, text: str) -> int:
        return len(self.encoding.encode(text))
