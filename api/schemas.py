from pydantic import HttpUrl
from pydantic import BaseModel
from typing import Optional
from typing import List


class Attachment(BaseModel):
    name: str
    url: str


class RequestModel(BaseModel):
    email: str
    secret: str
    task: str
    round: int
    nonce: str
    brief: str
    checks: List[str]
    evaluationurl: HttpUrl
    attachments: Optional[List[Attachment]] = []
