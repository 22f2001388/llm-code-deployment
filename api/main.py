from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .schemas import Attachment
from .schemas import RequestModel

app = FastAPI(title="LLM Code Deployment API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
    expose_headers=["*"],
)


@app.get("/")
def health():
    return {"message": "api is working"}


@app.post("/make")
async def make(request_data: RequestModel):
    try:
        parsed = request_data.dict()
        parsed["evaluationurl"] = str(parsed["evaluationurl"])

        if parsed:
            return JSONResponse(
                content={
                    "response": "Request received and parsed successfully",
                    "data_recieved": parsed,
                },
                status_code=200,
            )
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
