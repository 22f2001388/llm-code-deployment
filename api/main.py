from fastapi import FastAPI
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="LLM Code Deployment API", version="0.1.0")


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
async def make(request: Request):
    try:
        data = await request.json()
        message = data.get("message")

        if message:
            return JSONResponse(
                content={"response": f"Yes, message received: '{message}'"}
            )
        else:
            return JSONResponse(
                content={"response": "Message received, but no 'message' field found"},
                status_code=400,
            )
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
