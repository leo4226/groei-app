from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json
names = ["Alpha","Bravo","Charlie","Delta"]
config = {"title":"Quiz test","people":[{"name":n} for n in names],"questions":[{"id":"q","text":"Demo?","top":"meest"}]}
rows = [{"name":n,"avg":i+1,"rank":min(i+1,3),"min":1,"max":3} for i,n in enumerate(names)]
admin = {"exists":True,"config":config,"join_code":"demo","responses":[],"results":{"participants":2,"questions":[{"id":"q","rows":rows}],"self_knowledge":[]}}
state = {"slide":None,"photo":None}
source = (Path(__file__).resolve().parents[1] / "frontend/public/jaarquiz/index.html").read_text(encoding="utf-8")
def route(r):
    path = r.request.url.split("?")[0]
    if path == "https://quiz.test/": return r.fulfill(body=source,content_type="text/html")
    if "/api/jaarquiz" not in path: return r.abort()
    if path.endswith("/admin/presentation"):
        state.update(r.request.post_data_json); result = {"ok":True}
    elif path.endswith("/admin"): result = admin
    elif path.endswith("/presentation"): result = {"slide":state["slide"],"circles":{}}
    elif "/photo/" in path: result = {"photo":state["photo"]}
    elif path.endswith("/waiting-room"): result = {"visitors":[]}
    else: result = dict(config,taken=[])
    r.fulfill(json=result)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    host = browser.new_page(viewport={"width":390,"height":844})
    guest = browser.new_page(viewport={"width":390,"height":844})
    errors=[]
    for page in [host,guest]:
        page.route("**/*",route)
        page.on("pageerror",lambda error: errors.append(str(error)))
    host.add_init_script("""if(location.origin==="https://quiz.test") localStorage.setItem('floreren-token','demo');""")
    host.goto("https://quiz.test/#presenteer")
    host.evaluate("localStorage.setItem(BONUS_KEY,JSON.stringify(demoBonus(1)))")
    host.reload()
    guest.goto("https://quiz.test/#demo")
    expect(guest.locator(".waiting-screen")).to_be_visible()
    host.get_by_text("Verder →").click()
    host.get_by_text("Verder →").click()
    expect(guest.get_by_text("Delta",exact=True)).to_be_visible(timeout=9000)
    expect(guest.get_by_text("Charlie",exact=True)).to_be_visible()
    expect(guest.get_by_text("Alpha",exact=True)).to_have_count(0)
    assert state["slide"]["fadeEnd"] > 0
    expect(guest.get_by_text("Alpha",exact=True)).to_be_visible(timeout=12000)
    host.get_by_text("Verder →").click()
    host.get_by_text("Verder →").click()
    assert state["slide"]["type"]=="q"
    host.get_by_text("Onthul voor iedereen").click()
    expect(guest.locator('img[alt="Wie zit er achter het silhouet?"]')).to_be_visible(timeout=8000)
    assert "Demo!" not in json.dumps(state["slide"]) and not state["slide"]["answer"]
    host.get_by_text("Verder →").click()
    assert not state["slide"]["answer"]
    host.get_by_text("Onthul voor iedereen").click()
    guest.reload()
    expect(guest.locator('img[alt="Demo"]')).to_be_visible(timeout=8000)
    host.goto("https://quiz.test/#beheer")
    host.get_by_text("Privé testen · hele presentatie",exact=False).click()
    host.get_by_text("Gastenbeeld",exact=True).click()
    expect(host.get_by_role("button",name="Beheerdersbeeld")).to_be_visible()
    expect(host.locator(".waiting-screen h1")).to_have_count(0)
    host.locator("select").select_option(label="Geheime bonus")
    host.get_by_text("Test delen met gasten").click()
    expect(host.locator("h1",has_text="Wie zit er achter het silhouet?")).to_be_visible()
    assert state["slide"]["answer"] is True
    voter = browser.new_page()
    voter.route("**/*",route)
    voter.goto("https://quiz.test/#dryrun")
    saved = voter.evaluate("""async () => {
      quiz = {...quiz,questions:[0,1,2,3].map(i=>({id:"q"+i,text:"Test "+i}))};
      mine = {voter:"Alpha",answers:{},done:false}; session={token:"fake"}; view="q"; qi=0; render();
      let writes=0; api=async (...args)=>{writes++; await new Promise(r=>setTimeout(r,80)); return {...mine,answers:args[2].answers}};
      const next=[...document.querySelectorAll("button")].find(b=>b.textContent.includes("Volgende"));
      next.click(); next.click();
      await new Promise(r=>setTimeout(r,200));
      return [writes,qi];
    }""")
    assert saved == [1,1], saved
    assert not errors, errors
    print("Host and guest phone viewport passed, including rejoin, shared bronze, fade signal and bonus.")
    browser.close()
