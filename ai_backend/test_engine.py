import ollama

print("🔥 Waking up Gemma 4...")

try:
    # Sending a quick test message to your local 9.6GB brain
    response = ollama.chat(model='gemma4:e4b', messages=[
        {
            'role': 'user',
            'content': 'Act like a video editing AI. In one short sentence, tell me you are ready to generate some captions.',
        },
    ])

    print("\n🧠 Gemma 4 says:")
    print(response['message']['content'])
    print("\n✅ ENGINE IS ONLINE!")

except Exception as e:
    print("\n❌ Whoops, something went wrong:")
    print(e)