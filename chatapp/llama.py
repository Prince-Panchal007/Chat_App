import pandas as pd

pairs = []
with open(r"D:\Video\chatapp\human_chat.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Clean and split lines
lines = [line.strip() for line in lines if line.strip()]

for i in range(len(lines)-1):
    if lines[i].startswith("Human 1:") and lines[i+1].startswith("Human 2:"):
        input_text = lines[i].replace("Human 1:", "").strip()
        reply_text = lines[i+1].replace("Human 2:", "").strip()
        pairs.append({"input": input_text, "reply": reply_text})

df = pd.DataFrame(pairs)
print(df.head())
df.to_csv("chats.csv", index=False)
