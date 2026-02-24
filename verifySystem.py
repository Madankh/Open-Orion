from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import os
from dotenv import load_dotenv
load_dotenv()

SECRET_KEY = os.getenv("JWT_SEC")
ALGORITHM = "HS256"

security = HTTPBearer(auto_error=True)

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload  
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    return verify_token(token)

def require_user_or_admin(user_id_param: str):
    async def checker(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
        token_data = verify_token(credentials.credentials)
        param_user_id = request.path_params.get(user_id_param)

        if token_data["id"] != param_user_id and not token_data.get("isAdmin", False):
            raise HTTPException(status_code=403, detail="Unauthorized access")

        return token_data
    return checker

def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token_data = verify_token(credentials.credentials)
    if not token_data.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Admins only")
    return token_data
