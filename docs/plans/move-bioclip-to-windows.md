# BioCLIP Worker: verplaatsen van WSL naar Windows

> **✅ DONE (2026-06-07).** Worker draait nu Windows-native via een uv-venv op **Python 3.12**
> (niet 3.12 systeembreed maar `backend\.venv`, uv-managed). torch 2.6.0+cu124 + deps geïnstalleerd,
> incl. `python-multipart` (ontbrak in de lijst hieronder, nodig voor `/identify`). Startup-script
> omgezet naar `Start-Process`, scheduled task "Floreren Workers" opnieuw geregistreerd
> (AtLogon+AtStartup). End-to-end geverifieerd via `bioclip.floreren.app` op RTX 2070/CUDA.
> Het plan hieronder is de oorspronkelijke opzet (referentie).

## Huidige situatie

BioCLIP worker draait **in WSL** (Ubuntu) op poort 8001.
Wordt gestart via `C:\Users\leon_\Scripts\start-floreren-workers.ps1`.
Cloudflare tunnel `bioclip.floreren.app` → WSL `localhost:8001`.

## Probleem

- Python 3.14 op Windows heeft **geen PyTorch** (nog geen wheels)
- Wil de worker liever native op Windows draaien (geen WSL-afhankelijkheid)

## Oplossing

1. **Installeer Python 3.12** naast de bestaande Python 3.14
   - Download van python.org of via `winget install Python.Python.3.12`
2. **Installeer dependencies** in Python 3.12:
   ```
   C:\Python312\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
   C:\Python312\python.exe -m pip install open-clip-torch fastapi uvicorn[standard] pillow numpy httpx
   ```
3. **Update `C:\Users\leon_\Scripts\start-floreren-workers.ps1`**:
   - Vervang de WSL-startregel door Windows-start:
   ```powershell
   # Oud (WSL):
   wsl -d Ubuntu -e bash -c "cd /mnt/c/Users/leon_/Projects/Floreren/backend && nohup .venv/bin/python bioclip_worker.py > /dev/null 2>&1 &"
   
   # Nieuw (Windows native):
   Start-Process -FilePath "C:\Python312\python.exe" -ArgumentList "C:\Users\leon_\Projects\Floreren\backend\bioclip_worker.py" -WindowStyle Hidden
   ```
4. **Test**:
   ```
   curl http://localhost:8001/health
   # Verwacht: {"status":"ok","model_loaded":true,"device":"cuda"}
   curl https://bioclip.floreren.app/health
   # Verwacht:zelfde
   ```

## Huidige status van startup script (voor referentie)

Zie `C:\Users\leon_\Scripts\start-floreren-workers.ps1` — de WSL-path is al gefixt
(gebruikt `/mnt/c/Users/leon_/...` i.p.v. `~/...`), maar draait nog via WSL.

## Bestanden

| Bestand | Pad |
|---|---|
| Worker script | `C:\Users\leon_\Projects\Floreren\backend\bioclip_worker.py` |
| Startup script | `C:\Users\leon_\Scripts\start-floreren-workers.ps1` |
| Taakregistratie | `C:\Users\leon_\Scripts\register-task.ps1` |
| Scheduled task name | `Floreren Workers` |
| Cloudflare tunnel | `bioclip-worker` (naam), `d3e07eaa-19d7-43a7-9314-5526adb16173` (ID) |
