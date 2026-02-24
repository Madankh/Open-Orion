from enum import Enum

UPLOAD_FOLDER_NAME = "uploaded_files"
COMPLETE_MESSAGE = "Completed the task."
DEFAULT_MODEL="z-ai/glm-4.5-air:free"
# DEFAULT_MODEL="qwen/qwen3-vl-30b-a3b-instruct"

TOKEN_BUDGET = 40_000
SUMMARY_MAX_TOKENS = 4000
VISIT_WEB_PAGE_MAX_OUTPUT_LENGTH = 20_000

class WorkSpaceMode(Enum):
    DOCKER = "docker"
    LOCAL = "local"

    def __str__(self):
        return self.value