// ==========================================
// ELARA DASHBOARD
// dashboard.js
// ==========================================

// ------------------------------
// Greeting
// ------------------------------

const greetingText = document.getElementById("greetingText");

function userFirstName(){
    return (window.ElaraData&&ElaraData.user&&ElaraData.user.first)||localStorage.getItem("elaraFirstName")||((document.getElementById("userName")||{}).textContent||"").trim()||"there";
}

function getGreeting(){
    const h=(window.ElaraCommon?ElaraCommon.homeParts().hour:new Date().getHours());
    return h<12?"Good morning":h<18?"Good afternoon":"Good evening";
}

function updateGreeting(){

    const hour = (window.ElaraCommon ? ElaraCommon.homeParts().hour : new Date().getHours());

    let greeting="Good Evening";

    if(hour < 12){

        greeting="Good Morning";

    }
    else if(hour < 18){

        greeting="Good Afternoon";

    }

    greetingText.innerHTML = `${greeting}, ${userFirstName()} 👋`;

}

updateGreeting();


// ------------------------------
// Animated Numbers
// ------------------------------

function animateCounter(id,end){

    let current=0;

    const element=document.getElementById(id);

    const speed=Math.ceil(end/60);

    const counter=setInterval(()=>{

        current+=speed;

        if(current>=end){

            current=end;

            clearInterval(counter);

        }

        element.innerHTML=current;

    },20);

}




// ------------------------------
// Notification Popup
// ------------------------------

const popup=document.getElementById("notificationPopup");

setTimeout(()=>{

    popup.classList.add("show");

},1800);

setTimeout(()=>{

    popup.classList.remove("show");

},6500);


// ------------------------------
// Loading Screen
// ------------------------------

window.addEventListener("load", () => {

    const loadingScreen = document.getElementById("loadingScreen");

    // already removed by the inline script (not a fresh login)
    if (!loadingScreen) return;

    setTimeout(() => {
        loadingScreen.classList.add("hide");
        try { sessionStorage.setItem("elaraLoaded","1"); } catch(e){}
    },2000);

});


// ------------------------------
// AI Typing Effect
// ------------------------------

const aiMessage=document.getElementById("typingMessage");

const text=getGreeting()+" "+userFirstName()+" 👋 How can I help you manage your home today?";

let index=0;

aiMessage.innerHTML="";

function typeAI(){

    if(index<text.length){

        aiMessage.innerHTML+=text.charAt(index);

        index++;

        setTimeout(typeAI,35);

    }

}

typeAI();


// ------------------------------
// Sidebar Active Menu
// ------------------------------

const menuItems=document.querySelectorAll(".menu li");

menuItems.forEach(item=>{

    item.addEventListener("click",()=>{

        menuItems.forEach(i=>{

            i.classList.remove("active");

        });

        item.classList.add("active");

    });

});


// ------------------------------
// Quick Action Buttons
// ------------------------------

const quickButtons=document.querySelectorAll(".action-panel button");

quickButtons.forEach(button=>{

    button.addEventListener("click",()=>{

        button.style.transform="scale(.95)";

        setTimeout(()=>{

            button.style.transform="";

        },150);

    });

});


// ------------------------------
// Floating Button
// ------------------------------

const floating=document.querySelector(".floating-btn");

floating.addEventListener("click",()=>{

    window.location.href="dashboard-tasks.html";

});


// ------------------------------
// Welcome Notification
// ------------------------------

console.log("Welcome to Elara Smart Home");



// ==========================================================
// REAL DASHBOARD DATA
// Everything below reads the logged-in user's own data
// (tasks, members, devices, schedule, energy, activity).
// ==========================================================

(function(){

    const D = window.ElaraData;
    const cfg = window.ELARA_CONFIG || {};
    if(!D) return;

    const $ = (s,r)=> (r||document).querySelector(s);
    const $$ = (s,r)=> Array.from((r||document).querySelectorAll(s));
    const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const me = (D.user&&D.user.first) || localStorage.getItem("elaraFirstName") || "You";
    const todayKey = D.util.dayKey();
    const nowHM = ()=>{ const n=new Date(); return D.util.pad(n.getHours())+":"+D.util.pad(n.getMinutes()); };
    const read = (k,fb)=>D.util.load(k,fb);
    const toast = (m,t)=> window.ElaraUI && ElaraUI.toast(m,t);

    // ---------------------------------------------------------
    // Header: home name + live clock (in the home's timezone)
    // ---------------------------------------------------------
    function renderHeader(){
        const p = $(".welcome p");
        if(!p) return;
        const home = localStorage.getItem("elaraHomeName") || "Elara Home Management";
        const t = ElaraCommon.homeParts();
        p.innerHTML = "Welcome back to "+esc(home)+' <span class="home-clock"><i class="fa-regular fa-clock"></i> '+esc(t.text)+" \u2022 "+esc(t.time)+"</span>";
        const g = document.getElementById("greetingText");
        const h = t.hour, word = h<12?"Good Morning":h<18?"Good Afternoon":"Good Evening";
        if(g && !g.dataset.locked) g.innerHTML = word+", "+esc(me)+" \ud83d\udc4b";
    }

    // ---------------------------------------------------------
    // Stat cards
    // ---------------------------------------------------------
    function renderStats(){
        const tasks = D.tasks.all();
        const open = tasks.filter(t=>t.status!=="Completed");
        const dueToday = open.filter(t=>t.date===todayKey).length;
        set("taskCount", open.length, dueToday+" due today");

        const items = read("elaraShoppingItems", null);
        set("shoppingCount", items ? items.length : 0, "On your lists");

        const devs = D.devices.all();
        set("deviceCount", devs.length, devs.filter(d=>d.on).length+" On now");

        const e = D.energy.compute("today");
        const el = document.getElementById("energyCount");
        if(el) el.textContent = e.total.toFixed(1);
    }
    function set(id,val,sub){
        const el = document.getElementById(id);
        if(!el) return;
        el.textContent = val;
        const p = el.parentElement.querySelector("p");
        if(p && sub) p.textContent = sub;
    }

    // ---------------------------------------------------------
    // Energy chart (last 7 days, from the real on/off history)
    // ---------------------------------------------------------
    function renderChart(){
        const canvas = document.getElementById("energyChart");
        const e = D.energy.compute("week");
        const label = $(".energy-panel .panel-header span");
        if(label) label.textContent = e.total>0 ? "Last 7 Days \u2022 "+e.total.toFixed(1)+" kWh" : "No usage recorded yet";
        if(!canvas || typeof Chart==="undefined") return;

        const names=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], labels=[];
        for(let i=6;i>=0;i--) labels.push(names[D.util.addDays(new Date(),-i).getDay()]);

        new Chart(canvas,{
            type:"line",
            data:{ labels, datasets:[{
                label:"Energy (kWh)", data:e.series.map(v=>+v.toFixed(2)),
                borderColor:"#6C63FF", backgroundColor:"rgba(108,99,255,.15)",
                fill:true, tension:.4, borderWidth:3, pointRadius:4
            }]},
            options:{ responsive:true, maintainAspectRatio:false,
                plugins:{ legend:{ labels:{ color:"#b8bfd9" } } },
                scales:{ x:{ ticks:{color:"#b8bfd9"}, grid:{color:"rgba(255,255,255,.05)"} },
                         y:{ ticks:{color:"#b8bfd9"}, grid:{color:"rgba(255,255,255,.05)"}, beginAtZero:true } } }
        });
    }

    // ---------------------------------------------------------
    // Smart Home panel (the same device registry as the Smart Home page)
    // ---------------------------------------------------------
    const PINNED = ["Main Lights","Geyser","Garage Door","Air Conditioner"];
    function renderDevices(){
        const panel = $(".smart-panel");
        if(!panel) return;
        const all = D.devices.all();
        let show = PINNED.map(n=>all.find(d=>d.name===n)).filter(Boolean);
        all.forEach(d=>{ if(show.length<4 && !show.includes(d)) show.push(d); });
        $$(".device",panel).forEach(n=>n.remove());
        panel.insertAdjacentHTML("beforeend", show.length ? show.map(d=>
            '<div class="device" data-id="'+esc(d.id)+'"><div><i class="fa-solid '+esc(d.icon)+'"></i><div><h4>'+esc(d.name)+'</h4><span>'+status(d)+'</span></div></div>'+
            '<label class="switch"><input type="checkbox" '+(d.on?"checked":"")+'><span class="slider"></span></label></div>'
        ).join("") : '<p class="dash-empty">No devices yet. Add one on the Smart Home page.</p>');
    }
    function status(d){
        if(/door/i.test(d.name)) return d.on?"Open":"Closed";
        return d.on?"Currently ON":"Currently OFF";
    }
    document.addEventListener("change",e=>{
        const input = e.target.closest(".smart-panel .switch input");
        if(!input) return;
        const row = input.closest(".device");
        const d = D.devices.all().find(x=>x.id===row.dataset.id);
        if(!d) return;
        D.devices.set(d.id,input.checked);
        row.querySelector("span").textContent = status(Object.assign({},d,{on:input.checked}));
        renderStats(); renderActivity();
        toast(d.name+" turned "+(input.checked?"ON":"OFF"), input.checked?"success":"info");
    });

    // ---------------------------------------------------------
    // Today's tasks: tick = complete + remove
    // ---------------------------------------------------------
    function renderTasks(){
        const list = $(".task-list");
        if(!list) return;
        const open = D.tasks.all().filter(t=>t.status!=="Completed")
            .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,6);
        list.innerHTML = open.length ? open.map(t=>
            '<li data-id="'+t.id+'"><input type="checkbox" aria-label="Complete '+esc(t.title)+'"> '+esc(t.title)+
            (t.date!==todayKey?' <small class="dash-when">'+esc(t.date===D.util.dayKey(D.util.addDays(new Date(),1))?"Tomorrow":t.date)+'</small>':'')+'</li>').join("")
            : '<li class="dash-empty">\ud83c\udf89 All caught up. Nothing left to do.</li>';
        if(!$(".task-add")){
            list.insertAdjacentHTML("afterend",'<form class="task-add" autocomplete="off"><input type="text" placeholder="Add a task and press Enter..." maxlength="80"><button type="submit" aria-label="Add task"><i class="fa-solid fa-plus"></i></button></form>');
            $(".task-add").addEventListener("submit",ev=>{
                ev.preventDefault();
                const input = $(".task-add input"), title = input.value.trim();
                if(!title){ input.focus(); return; }
                const all = D.tasks.all();
                all.unshift({id:Date.now(),title,description:"Added from the dashboard.",priority:"Medium",assignee:me,date:todayKey,time:nowHM(),status:"Pending",progress:0});
                D.tasks.save(all); D.log("added task \u201c"+title+"\u201d","fa-list-check");
                input.value=""; renderTasks(); renderStats(); renderActivity(); toast("Task added.");
            });
        }
    }
    document.addEventListener("change",e=>{
        const box = e.target.closest(".task-list input[type=checkbox]");
        if(!box || !box.checked) return;
        const li = box.closest("li");
        const all = D.tasks.all(), t = all.find(x=>String(x.id)===li.dataset.id);
        if(!t) return;
        t.status="Completed"; t.progress=100;
        D.tasks.save(all); D.log("completed \u201c"+t.title+"\u201d","fa-circle-check");
        li.style.transition="all .35s ease"; li.style.opacity="0"; li.style.transform="translateX(24px)";
        setTimeout(()=>{ renderTasks(); renderStats(); renderActivity(); },350);
        toast("\u201c"+t.title+"\u201d completed.");
    });

    // ---------------------------------------------------------
    // Upcoming schedule
    // ---------------------------------------------------------
    function renderSchedule(){
        const panel = Array.from(document.querySelectorAll(".panel")).find(p=>/Upcoming Schedule/i.test((p.querySelector("h2")||{}).textContent||""));
        if(!panel) return;
        $$(".schedule-item,.dash-empty",panel).forEach(n=>n.remove());
        const tomorrow = D.util.dayKey(D.util.addDays(new Date(),1));
        const upcoming = read("elaraSchedules",[]).filter(e=>(e.date===todayKey && e.time>=nowHM()) || e.date===tomorrow)
            .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,4);
        panel.insertAdjacentHTML("beforeend", upcoming.length ? upcoming.map(e=>
            '<div class="schedule-item"><strong>'+esc(e.time)+'</strong><span>'+esc(e.title)+(e.date===tomorrow?' <small class="dash-when">Tomorrow</small>':'')+'</span></div>').join("")
            : '<p class="dash-empty">Nothing coming up. <a href="dashboard-schedule.html">Add an event</a></p>');
    }

    // ---------------------------------------------------------
    // Activity (Recent Activity panel + Live Home Activity feed)
    // ---------------------------------------------------------
    function renderActivity(){
        const items = D.activity(8);
        const recent = Array.from(document.querySelectorAll(".panel")).find(p=>/Recent Activity/i.test((p.querySelector("h2")||{}).textContent||""));
        if(recent){
            $$(".activity,.dash-empty",recent).forEach(n=>n.remove());
            recent.insertAdjacentHTML("beforeend", items.length ? items.slice(0,4).map(a=>
                '<div class="activity"><i class="fa-solid '+esc(a.icon)+'"></i> '+esc(a.who)+" "+esc(a.text)+'</div>').join("")
                : '<p class="dash-empty">Nothing yet. Activity shows up as you use the home.</p>');
        }
        const feed = $(".feed-list");
        if(feed){
            feed.innerHTML = items.length ? items.slice(0,6).map(a=>
                '<div class="feed-item"><i class="fa-solid '+esc(a.icon)+'"></i><span>'+esc(a.who)+" "+esc(a.text)+'</span><small>'+esc(D.ago(a.t))+'</small></div>').join("")
                : '<div class="feed-item"><i class="fa-solid fa-clock"></i><span>No activity yet</span><small></small></div>';
            const stamp = $(".live-feed .panel-header span"); if(stamp) stamp.textContent="Updated just now";
        }
    }

    // ---------------------------------------------------------
    // Family members (from the Members page)
    // ---------------------------------------------------------
    function renderFamily(){
        const panel = $(".family-panel");
        if(!panel) return;
        const roles = {owner:"Home Owner",adult:"Adult",member:"Member",guest:"Guest"};
        const pic = localStorage.getItem("elaraProfileImage")||"";
        $$(".member",panel).forEach(n=>n.remove());
        const list = D.members.all().filter(m=>m.status!=="pending");
        panel.insertAdjacentHTML("beforeend", list.map(m=>{
            const img = m.role==="owner" && pic ? pic : m.avatar;
            const avatar = img ? '<img src="'+esc(img)+'" alt="">' : '<div class="dash-avatar">'+esc(m.name.charAt(0).toUpperCase())+'</div>';
            return '<div class="member">'+avatar+'<div><h4>'+esc(m.name)+'</h4><span>'+esc(roles[m.role]||m.role)+'</span></div><div class="'+(m.status==="online"?"online":"offline")+'"></div></div>';
        }).join("") || '<p class="dash-empty">Invite people on the Members page.</p>');
    }

    // ---------------------------------------------------------
    // Weather: real location + real forecast (Open-Meteo, no key needed)
    // ---------------------------------------------------------
    const WMO = {0:["Clear sky","fa-sun"],1:["Mainly clear","fa-sun"],2:["Partly cloudy","fa-cloud-sun"],3:["Overcast","fa-cloud"],
        45:["Foggy","fa-smog"],48:["Foggy","fa-smog"],51:["Light drizzle","fa-cloud-rain"],53:["Drizzle","fa-cloud-rain"],55:["Heavy drizzle","fa-cloud-rain"],
        61:["Light rain","fa-cloud-rain"],63:["Rain","fa-cloud-rain"],65:["Heavy rain","fa-cloud-showers-heavy"],71:["Light snow","fa-snowflake"],73:["Snow","fa-snowflake"],
        75:["Heavy snow","fa-snowflake"],80:["Rain showers","fa-cloud-showers-heavy"],81:["Rain showers","fa-cloud-showers-heavy"],82:["Violent showers","fa-cloud-showers-heavy"],
        95:["Thunderstorm","fa-cloud-bolt"],96:["Thunderstorm","fa-cloud-bolt"],99:["Thunderstorm","fa-cloud-bolt"]};

    function paintWeather(w){
        const box = $(".weather-content"); if(!box) return;
        const info = WMO[w.code] || ["Unknown","fa-cloud"];
        box.querySelector("h1").textContent = ElaraCommon.fmtTemp(w.temp);
        box.querySelector("h3").textContent = w.city;
        box.querySelector("p").textContent = info[0];
        const spans = box.querySelectorAll(".weather-details span");
        if(spans[0]) spans[0].textContent = Math.round(w.humidity)+"%";
        if(spans[1]) spans[1].textContent = Math.round(w.wind)+" km/h";
        if(spans[2]) spans[2].textContent = Math.round(w.rain)+"%";
        const ic = $(".weather-panel .panel-header i"); if(ic) ic.className = "fa-solid "+info[1];
        window.__elaraWeather = w;
    }
    async function loadWeather(lat,lon,city){
        const url = "https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+
            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&hourly=precipitation_probability&forecast_days=1&timezone="+encodeURIComponent(localStorage.getItem("elaraTimezone")||"auto");
        const r = await fetch(url); if(!r.ok) throw new Error("weather");
        const j = await r.json(), hour = ElaraCommon.homeParts().hour;
        const w = { temp:j.current.temperature_2m, humidity:j.current.relative_humidity_2m, wind:j.current.wind_speed_10m,
                    code:j.current.weather_code, rain:(j.hourly.precipitation_probability||[])[hour]||0, city:city, t:Date.now() };
        try{ sessionStorage.setItem("elaraWeather",JSON.stringify(w)); }catch(e){}
        paintWeather(w);
    }
    async function cityName(lat,lon){
        try{
            const r = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude="+lat+"&longitude="+lon+"&localityLanguage=en");
            const j = await r.json();
            return j.city || j.locality || j.principalSubdivision || "Your location";
        }catch(e){ return "Your location"; }
    }
    function initWeather(){
        // a saved Home Location (Settings) wins over the browser's location
        let home = null;
        try{ home = JSON.parse(localStorage.getItem("elaraHomeCoords")||"null"); }catch(e){}
        if(home && home.lat!=null){
            loadWeather(home.lat, home.lon, home.city || String(home.label||"").split(",")[0]).catch(()=>{});
            return;
        }
        try{
            const c = JSON.parse(sessionStorage.getItem("elaraWeather")||"null");
            if(c && Date.now()-c.t < 15*60*1000){ paintWeather(c); return; }
        }catch(e){}
        const fallback = ()=>loadWeather(cfg.defaultLat||-26.2041, cfg.defaultLon||28.0473, localStorage.getItem("elaraHomeCity")||cfg.defaultCity||"Johannesburg").catch(()=>{});
        if(!navigator.geolocation){ fallback(); return; }
        navigator.geolocation.getCurrentPosition(async pos=>{
            const {latitude:lat, longitude:lon} = pos.coords;
            try{ await loadWeather(lat,lon,await cityName(lat,lon)); }catch(e){ fallback(); }
        }, fallback, {timeout:8000, maximumAge:600000});
    }

    // ---------------------------------------------------------
    // AI assistant: acts on your data, falls back to a real AI endpoint if configured
    // ---------------------------------------------------------
    const chatWindow = $(".chat-window"), chatInput = $(".chat-input input"), chatSend = $(".chat-input button");

    function addMessage(who,text){
        const msg = document.createElement("div");
        msg.className = "message "+who;
        msg.innerHTML = who==="ai" ? '<i class="fa-solid fa-robot"></i><div><strong>Elara AI</strong><p></p></div>' : '<div><strong>You</strong><p></p></div>';
        msg.querySelector("p").textContent = text;
        chatWindow.appendChild(msg); chatWindow.scrollTop = chatWindow.scrollHeight;
        return msg;
    }
    const norm = s=>s.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
    function bestDevice(q){
        const words = norm(q).split(" ").filter(w=>w.length>2 && !["the","turn","switch","off","please","for","and","light","lights"].includes(w));
        let best=null,score=0;
        D.devices.all().forEach(d=>{
            const hay = norm(d.name+" "+d.room); let s=0;
            words.forEach(w=>{ if(hay.includes(w)) s++; });
            if(s>score){ score=s; best=d; }
        });
        return best;
    }
    function listify(arr){ return arr.length<=1 ? (arr[0]||"") : arr.slice(0,-1).join(", ")+" and "+arr[arr.length-1]; }

    function localAnswer(raw){
        const q = norm(raw);
        let m;

        if((m = raw.match(/^(?:please\s+)?(?:add|create|new)\s+(?:a\s+)?task\s*(?:to|:)?\s*(.+)$/i)) || (m = raw.match(/^remind me to\s+(.+)$/i))){
            const title = m[1].trim().replace(/\.$/,"");
            const all = D.tasks.all();
            const tomorrow = /\btomorrow\b/i.test(title);
            all.unshift({id:Date.now(),title:title.replace(/\s*\btomorrow\b/i,"").trim()||title,description:"Added by Elara AI.",priority:"Medium",assignee:me,
                date: tomorrow? D.util.dayKey(D.util.addDays(new Date(),1)) : todayKey, time:"12:00",status:"Pending",progress:0});
            D.tasks.save(all); D.log("added task \u201c"+title+"\u201d via Elara AI","fa-robot");
            refreshAll(); return "Done. I added \u201c"+title+"\u201d to your tasks"+(tomorrow?" for tomorrow.":".");
        }
        if((m = raw.match(/^(?:complete|finish|tick off|done with|mark)\s+(?:the\s+)?(?:task\s+)?(.+?)(?:\s+as done)?$/i))){
            const needle = norm(m[1]), all = D.tasks.all();
            const t = all.find(x=>x.status!=="Completed" && norm(x.title).includes(needle));
            if(t){ t.status="Completed"; t.progress=100; D.tasks.save(all); D.log("completed \u201c"+t.title+"\u201d via Elara AI","fa-robot"); refreshAll(); return "Nice. \u201c"+t.title+"\u201d is marked as completed."; }
            return "I couldn\u2019t find an open task matching \u201c"+m[1]+"\u201d.";
        }
        if((m = raw.match(/^(?:turn|switch)\s+(on|off)\s+(.+)$/i))){
            const on = m[1].toLowerCase()==="on", target = m[2];
            if(/\ball\b.*\blights?\b|\blights?\b$/.test(norm(target)) && /\ball\b|\blights\b/.test(norm(target))){
                const lights = D.devices.all().filter(d=>/light/i.test(d.name)); lights.forEach(d=>D.devices.set(d.id,on));
                refreshAll(); return "All "+lights.length+" lights are now "+(on?"on":"off")+".";
            }
            const d = bestDevice(target);
            if(!d) return "I couldn\u2019t find a device called \u201c"+target+"\u201d. Try the Smart Home page.";
            D.devices.set(d.id,on); refreshAll(); return d.name+" ("+d.room+") is now "+(on?"on":"off")+".";
        }
        if(/(add|put)\s+(.+?)\s+(to|on)\s+(?:my\s+|the\s+)?(shopping|grocery)/i.test(raw)){
            const name = raw.match(/(?:add|put)\s+(.+?)\s+(?:to|on)\s+/i)[1].trim();
            const items = read("elaraShoppingItems",[]);
            items.push({id:Date.now(),name:name.charAt(0).toUpperCase()+name.slice(1),details:"Added by Elara AI",price:0,category:"Groceries",status:"Pending",icon:"fa-cart-shopping"});
            localStorage.setItem("elaraShoppingItems",JSON.stringify(items)); D.log("added "+name+" to the shopping list","fa-cart-shopping"); refreshAll();
            return "Added "+name+" to your shopping list.";
        }
        if(/\b(open|go to|take me to|show)\b/.test(q)){
            const map={tasks:"dashboard-tasks.html",shopping:"dashboard-shopping.html",schedule:"dashboard-schedule.html",calendar:"dashboard-schedule.html",
                "smart home":"dashboard-smart-home.html",devices:"dashboard-smart-home.html",analytics:"dashboard-analytics.html",members:"dashboard-members.html",settings:"dashboard-settings.html"};
            for(const k in map) if(q.includes(k)){ setTimeout(()=>location.href=map[k],700); return "Opening "+k+"..."; }
        }
        if(/\b(weather|temperature|rain|hot|cold|forecast)\b/.test(q)){
            const w = window.__elaraWeather;
            return w ? "It\u2019s "+ElaraCommon.fmtTemp(w.temp)+" and "+(WMO[w.code]||["unknown"])[0].toLowerCase()+" in "+w.city+", with "+Math.round(w.rain)+"% chance of rain." : "I\u2019m still fetching the weather. Try again in a moment.";
        }
        if(/\b(energy|power|electric|electricity|usage|kwh|bill|cost)\b/.test(q)){
            const t = D.energy.compute("today"), w = D.energy.compute("week");
            if(!w.hasData) return "I don\u2019t have any usage history yet. Open Analytics to load sample data, or keep using your devices and I\u2019ll track it.";
            const top = w.devices[0];
            return "Today you\u2019ve used "+t.total.toFixed(1)+" kWh (about R"+t.cost.toFixed(2)+"). This week: "+w.total.toFixed(1)+" kWh, roughly R"+w.cost.toFixed(2)+(top?". "+top.name+" is your biggest user.":".");
        }
        if(/\b(task|todo|to do|chores?)\b/.test(q)){
            const open = D.tasks.all().filter(t=>t.status!=="Completed");
            return open.length ? "You have "+open.length+" open task"+(open.length===1?"":"s")+": "+listify(open.slice(0,4).map(t=>t.title))+"." : "You\u2019re all caught up. No open tasks.";
        }
        if(/\b(schedule|calendar|agenda|event|today)\b/.test(q)){
            const ev = read("elaraSchedules",[]).filter(e=>e.date===todayKey).sort((a,b)=>a.time.localeCompare(b.time));
            return ev.length ? "Today: "+listify(ev.map(e=>e.title+" at "+e.time))+"." : "Nothing is scheduled for today.";
        }
        if(/\b(who|home|family|members?)\b/.test(q)){
            const at = D.members.all().filter(x=>x.status==="online");
            return at.length ? "Home right now: "+listify(at.map(x=>x.name))+"." : "Nobody is marked as home.";
        }
        if(/\b(devices?|lights?|on now)\b/.test(q)){
            const on = D.devices.all().filter(d=>d.on);
            return on.length ? on.length+" device(s) are on: "+listify(on.slice(0,6).map(d=>d.name))+"." : "Everything is switched off.";
        }
        if(/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q)) return "Hi "+me+"! I can add tasks, switch devices, check energy use, the weather and your schedule. Just ask.";
        if(/\b(help|what can you do)\b/.test(q)) return "Try: \u201cadd task buy bread\u201d, \u201cturn off the geyser\u201d, \u201cturn on all lights\u201d, \u201chow much energy did I use\u201d, \u201cwhat\u2019s on today\u201d or \u201cwhat\u2019s the weather\u201d.";
        return null;
    }

    function context(){
        const w = window.__elaraWeather;
        return { name:me, today:todayKey, time:nowHM(),
            openTasks:D.tasks.all().filter(t=>t.status!=="Completed").map(t=>t.title+" ("+t.date+")").slice(0,15),
            events:read("elaraSchedules",[]).filter(e=>e.date===todayKey).map(e=>e.time+" "+e.title),
            devicesOn:D.devices.all().filter(d=>d.on).map(d=>d.name+" ("+d.room+")"),
            energyWeekKwh:+D.energy.compute("week").total.toFixed(1), weather:w?{temp:w.temp,city:w.city}:null };
    }
    async function askServer(text){
        const headers = {"Content-Type":"application/json"};
        try{
            const c = await D.getClient(); const s = await c.auth.getSession();
            if(s.data && s.data.session) headers.Authorization = "Bearer "+s.data.session.access_token;
            if(cfg.supabaseAnonKey) headers.apikey = cfg.supabaseAnonKey;
        }catch(e){}
        const r = await fetch(cfg.aiEndpoint,{method:"POST",headers,body:JSON.stringify({message:text,context:context()})});
        if(!r.ok) throw new Error("ai");
        return (await r.json()).reply;
    }

    async function sendChat(){
        const text = chatInput.value.trim();
        if(!text){ chatInput.focus(); chatInput.placeholder="Type a message first..."; setTimeout(()=>chatInput.placeholder="Ask Elara anything...",2000); return; }
        addMessage("user",text); chatInput.value="";
        const pending = addMessage("ai","...");
        let answer = localAnswer(text);
        if(answer==null && cfg.aiEndpoint){ try{ answer = await askServer(text); }catch(e){ answer = "I couldn\u2019t reach the AI service right now."; } }
        if(answer==null) answer = "I can manage tasks, devices, shopping, energy and your schedule. Try \u201chelp\u201d to see examples.";
        setTimeout(()=>{ pending.querySelector("p").textContent = answer; chatWindow.scrollTop = chatWindow.scrollHeight; },350);
    }
    if(chatInput && chatSend && chatWindow){
        chatSend.addEventListener("click",sendChat);
        chatInput.addEventListener("keydown",e=>{ if(e.key==="Enter") sendChat(); });
    }

    // ---------------------------------------------------------
    // Navigation: quick actions, View All links, clickable cards, bell
    // ---------------------------------------------------------
    const ACTIONS = {"add task":"dashboard-tasks.html","add grocery":"dashboard-shopping.html","invite member":"dashboard-members.html","add smart device":"dashboard-smart-home.html"};
    $$(".action-panel button").forEach(btn=>btn.addEventListener("click",()=>{
        const url = ACTIONS[btn.textContent.trim().toLowerCase()];
        if(url) setTimeout(()=>location.href=url,180);
    }));
    $$(".panel-header a[href='#']").forEach(a=>{
        const t=(a.parentElement.querySelector("h2")||{}).textContent||"";
        a.setAttribute("href", /task/i.test(t)?"dashboard-tasks.html":/smart/i.test(t)?"dashboard-smart-home.html":/shop/i.test(t)?"dashboard-shopping.html":"dashboard-content.html");
    });
    [[".energy-panel","dashboard-analytics.html"],[".family-panel","dashboard-members.html"],
     [".stats .card:nth-child(1)","dashboard-tasks.html"],[".stats .card:nth-child(2)","dashboard-shopping.html"],
     [".stats .card:nth-child(3)","dashboard-smart-home.html"],[".stats .card:nth-child(4)","dashboard-analytics.html"]]
     .forEach(([sel,url])=>$$(sel).forEach(el=>{ el.style.cursor="pointer"; el.addEventListener("click",e=>{ if(!e.target.closest("input,button,a,.switch,form,.member")) location.href=url; }); }));
    document.addEventListener("click",e=>{ const m=e.target.closest(".family-panel .member"); if(m) location.href="dashboard-members.html"; });

    // ---------------------------------------------------------
    function refreshAll(){ renderStats(); renderDevices(); renderTasks(); renderSchedule(); renderActivity(); renderFamily(); }
    refreshAll(); renderChart(); initWeather(); renderHeader();
    setInterval(renderHeader,20000);
    setInterval(()=>{ renderActivity(); renderSchedule(); },30000);
    window.addEventListener("storage",refreshAll);

})();
