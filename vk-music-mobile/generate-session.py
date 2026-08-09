import asyncio

# 1. Crear e inicializar el event loop ANTES de importar Pyrogram
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# 2. Ahora sí importar Pyrogram
from pyrogram import Client

async def main():
    api_id = int(input("Ingresa tu API_ID: "))
    api_hash = input("Ingresa tu API_HASH: ")
    
    async with Client("temp_session", api_id=api_id, api_hash=api_hash, in_memory=True) as app:
        session_string = await app.export_session_string()
        print("\n" + "="*60)
        print("COPIA ESTA STRING SESSION COMPLETA:")
        print(session_string)
        print("="*60 + "\n")

if __name__ == "__main__":
    loop.run_until_complete(main())