import asyncio
from typing import List
import os
import numpy as np
# NEW: Import the CohereEmbeddings class instead of OpenAIEmbeddings
from langchain_cohere import CohereEmbeddings	

from .base import Compressor

from dotenv import load_dotenv
load_dotenv() 

class EmbeddingCompressor(Compressor):

    def __init__(
        self,
        similarity_threshold: float,
        # The model name now refers to a Cohere model
        embedding_model: str = "embed-multilingual-v3.0",
    ):
        # if cohere_api_key is None:
        #     cohere_api_key = os.getenv("COHERE_API_KEY")  # fallback to env var

        self._embedding_model = CohereEmbeddings(
            model=embedding_model,
            cohere_api_key="",
            # input_type="search_document" is often a good default for this use case
        )
        # ---------------------------------
        self.similarity_threshold = similarity_threshold

    def cosine_similarity_batch(self, matrix1, matrix2):
        """
        Compute cosine similarity between two matrices efficiently.
        """
        matrix1 = np.array(matrix1)
        matrix2 = np.array(matrix2)
        norm1 = np.linalg.norm(matrix1, axis=1, keepdims=True)
        norm2 = np.linalg.norm(matrix2, axis=1)
        return np.dot(matrix1, matrix2.T) / (norm1 * norm2)

    async def acompress(self, chunks: List[str], title: str, query: str) -> List[int]:
        # THIS METHOD DOES NOT CHANGE AT ALL!
        # CohereEmbeddings also has .aembed_query and .aembed_documents methods.
        query_emb, title_emb, chunks_emb = await asyncio.gather(
            self._embedding_model.aembed_query(query),
            self._embedding_model.aembed_query(title),
            self._embedding_model.aembed_documents(chunks),
        )

        similarities = self.cosine_similarity_batch(chunks_emb, [query_emb, title_emb])

        max_similarities = np.max(similarities, axis=1)
        relevant_indices = np.where(max_similarities >= self.similarity_threshold)[0]
        sorted_indices = relevant_indices[np.argsort(
            -max_similarities[relevant_indices])]  # sort by decreasing of relevance
        return sorted_indices.tolist()