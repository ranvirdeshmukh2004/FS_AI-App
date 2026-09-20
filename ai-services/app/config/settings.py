from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Qdrant — two ways to connect.
    #
    # qdrant_url takes precedence and is what a managed cluster (Qdrant Cloud's
    # free tier included) hands you: a full https URL plus an API key. The
    # host/port pair is the local-Docker path and stays the default so nothing
    # about `docker compose up` changes.
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333

    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    collection_name: str = "chat_memory"

    # The Python tool executes model-authored code. Its sandbox is a
    # best-effort blocklist, not a real jail, so it stays off unless the
    # operator explicitly turns it on.
    enable_python_tool: bool = False

    # Comma-separated list of allowed browser origins; "*" allows any.
    cors_origins: str = "*"

    class Config:
        env_file = ".env"

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
