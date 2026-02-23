from pydantic import BaseModel, Field


class AuthCredentialsIn(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8, max_length=256)


class AuthUserOut(BaseModel):
    id: str
    username: str
    name: str

    class Config:
        orm_mode = True


class AuthStatusOut(BaseModel):
    status: str
