import pandas as pd
import ast
import re
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

# --------------------------
# Load data
# --------------------------
train_df = pd.read_csv("D:/Video/chatapp/data/train.csv")
val_df   = pd.read_csv("D:/Video/chatapp/data/validation.csv")
test_df  = pd.read_csv("D:/Video/chatapp/data/test.csv")

for df in [train_df, val_df, test_df]:
    df['dialog'] = df['dialog'].apply(ast.literal_eval)

def build_pairs(dialog_list):
    pairs = []
    if len(dialog_list) == 1:  
        text = dialog_list[0]
        turns = re.split(r"[?!.]\s+", text)
        turns = [t.strip() for t in turns if t.strip()]
    else:
        turns = dialog_list
    for i in range(len(turns) - 1):
        pairs.append((turns[i], turns[i+1]))
    return pairs

def get_all_pairs(df):
    all_pairs = []
    for dialog in df['dialog']:
        all_pairs.extend(build_pairs(dialog))
    return pd.DataFrame(all_pairs, columns=["input", "reply"])

train_pairs = get_all_pairs(train_df)

# --------------------------
# Vectorizer + KNN
# --------------------------
vectorizer = TfidfVectorizer(stop_words="english")
X = vectorizer.fit_transform(train_pairs["input"])

knn = NearestNeighbors(n_neighbors=3, metric="cosine")
knn.fit(X)

def suggest_reply(user_input, top_k=3):
    user_vec = vectorizer.transform([user_input])
    distances, indices = knn.kneighbors(user_vec, n_neighbors=top_k)
    
    suggestions = []
    for idx in indices[0]:
        reply = train_pairs.iloc[idx]["reply"]
        suggestions.append(reply)
    return suggestions
