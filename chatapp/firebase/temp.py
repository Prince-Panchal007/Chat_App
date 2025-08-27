import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.neighbors import NearestNeighbors

# Load data
df = pd.read_csv(r"D:\Video\chatapp\firebase\chats.csv")

# Use a pretrained sentence embedding model
model = SentenceTransformer("all-MiniLM-L6-v2")

# Encode input sentences
X = model.encode(df["input"], convert_to_tensor=False)

# Fit NearestNeighbors
knn = NearestNeighbors(n_neighbors=5, metric="cosine")
knn.fit(X)

def get_replies(user_input, top_k=5):
    vec = model.encode([user_input], convert_to_tensor=False)
    distances, indices = knn.kneighbors(vec, n_neighbors=top_k)
    
    results = []
    for idx, dist in zip(indices[0], distances[0]):
        results.append((df["reply"].iloc[idx], 1-dist))  # similarity = 1 - distance
    return results

# Example
print("\nExample for 'wassup':")
for reply, sim in get_replies("wassup", top_k=5):
    print(f"- {reply} (similarity: {sim:.2f})")

while True:
    user_inp = input("\nEnter input: ")
    if user_inp.lower() in ["exit", "quit"]:
        break
    suggestions = get_replies(user_inp, top_k=5)
    print("\nTop suggestions:")
    for reply, dist in suggestions:
        print(f"- {reply} (similarity: {1-dist:.2f})")