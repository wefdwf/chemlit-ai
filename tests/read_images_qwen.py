"""用千问 VL 读取简历和 JD 截图，结果保存到本地文件"""
import base64, json, requests, sys, os

QWEN_API_KEY = "sk-cbda5a5d6c0f43288409d5243d06cd89"
QWEN_API_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"

images = [
    (r"C:\Users\28067\Pictures\Screenshots\屏幕截图 2026-06-21 163558.png",
     "这是一份简历截图。请逐字逐句识别图中所有文字，包括每个模块标题和内容。按原来的排版结构输出。",
     "resume_text.txt"),
    (r"C:\Users\28067\Pictures\Screenshots\屏幕截图 2026-06-21 164110.png",
     "这是一张职位描述(JD)截图。请逐字逐句识别图中所有文字。按原来的结构输出。",
     "jd_image_text.txt"),
]

out_dir = os.path.dirname(os.path.abspath(__file__))

for img_path, prompt, out_name in images:
    print(f"Reading: {os.path.basename(img_path)} ...")
    with open(img_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    payload = {
        "model": "qwen-vl-max",
        "input": {
            "messages": [{
                "role": "user",
                "content": [
                    {"image": f"data:image/png;base64,{img_b64}"},
                    {"text": prompt},
                ]
            }]
        }
    }

    resp = requests.post(
        QWEN_API_URL, json=payload,
        headers={"Authorization": f"Bearer {QWEN_API_KEY}", "Content-Type": "application/json"},
        timeout=120
    )
    data = resp.json()
    try:
        text = data["output"]["choices"][0]["message"]["content"]
        if isinstance(text, list):
            text = "\n".join(t.get("text", "") for t in text if isinstance(t, dict))
    except Exception:
        text = json.dumps(data, ensure_ascii=False, indent=2)

    out_path = os.path.join(out_dir, out_name)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  -> saved to {out_path} ({len(text)} chars)")

print("\nDone!")
