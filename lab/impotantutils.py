import base64
from PIL import Image
from io import BytesIO
import requests

MAX_LENGTH_TRUNCATE_CONTENT = 20000

def save_base64_image_png(base64_str:str, path:str)->None:
    if "," in base64_str:
        base64_str = base64_str.split(",")[1]
    image_data = base64.b64decode(base64_str)
    image = Image.open(BytesIO(image_data)).convert("RGBA")
    image.save(path, format="PNG")


def encode_image(image_path):
    if image_path.startswith("http"):
        user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0"
        request_kwargs = {
            "headers": {"User-Agent": user_agent},
            "stream": True,
        }

        response = requests.get(image_path, **request_kwargs)
        response.raise_for_status()
        image_data = response.content
        return base64.b64encode(image_data).decode("utf-8")

    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")



def truncate_content(
    content: str, max_length: int = MAX_LENGTH_TRUNCATE_CONTENT
) -> str:
    if len(content) <= max_length:
        return content
    else:
        return (
            content[: max_length // 2]
            + f"\n..._This content has been truncated to stay below {max_length} characters_...\n"
            + content[-max_length // 2 :]
        )