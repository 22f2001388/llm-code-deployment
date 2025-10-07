import os


def update_env_variables():
    with open("api/.env", "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.system(f'echo "{v.strip()}" | vercel env add {k.strip()} production')


if __name__ == "__main__":
    update_env_variables()
