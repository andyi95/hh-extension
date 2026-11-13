from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class DeviceIn(BaseModel):
    device_label: str | None = Field(None, max_length=200, examples=["Chrome / Windows"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: Password
    display_name: str | None = Field(None, max_length=100)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    device_label: str | None = Field(None, max_length=200)


class RefreshIn(BaseModel):
    refresh_token: str = Field(max_length=200)


class TokenOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str | None
    display_name: str | None
    is_registered: bool
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=100)
    current_password: str | None = Field(None, max_length=128)
    new_password: Password | None = None
