from openai import AsyncOpenAI

from app.config import settings


async def generate_embedding(text: str, api_key: str) -> list[float]:
    client = AsyncOpenAI(api_key=api_key)
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text,
        dimensions=settings.embedding_dimensions,
    )
    return response.data[0].embedding
