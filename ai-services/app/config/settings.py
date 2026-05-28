from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    collection_name: str = "chat_memory"

    class Config:
        env_file = ".env"


settings = Settings()
