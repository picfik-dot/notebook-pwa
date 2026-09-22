const $ = (selector) => document.querySelector(selector);
const canvas = $('#canvas');
const layer = $('#nodes-layer');
const svg = $('#connections');
const titleInput = $('#map-title');
const stateLabel = $('#save-state');
const inspector = $('#inspector');
const nodeText = $('#node-text');
const toast = $('#toast');
const mapList = $('#map-list');
const attachmentList = $('#attachment-list');
const uploadInput = $('#attachment-upload');
const nodeInspector = $('#node-inspector');
const fileInspector = $('#file-inspector');
const fileMeta = $('#file-meta');
const fileImage = $('#file-image');
const filePdf = $('#file-pdf');
const fileEditor = $('#file-editor');
const fileSave = $('#file-save');
const fileDownload = $('#file-download');
let zoom = 1;
let selectedId = 'root';
let map = { title: '我的第一个想法', nodes: [
  { id:'root', text:'我的第一个\n想法', x:370, y:220, color:'coral', parent:null, root:true },
  { id:'focus', text:'核心目标', x:130, y:105, color:'blue', parent:'root' },
  { id:'steps', text:'下一步行动', x:635, y:105, color:'mint', parent:'root' },
  { id:'notes', text:'灵感与笔记', x:640, y:350, color:'yellow', parent:'root' },
  { id:'question', text:'还有什么？', x:120, y:350, color:'blue', parent:'root' }
]};
let dragging = null;
let panning = null;
let panX = 0;
let panY = 0;
const SYNC_ORIGIN = window.MINDFOLD_SYNC_ORIGIN || location.origin;
const SYNC_URL = `${SYNC_ORIGIN}/api/state`;
let syncing = false;
let maps = {};
let activeMapId = 'default';
let attachments = [];
let selectedFile = null;
const colors = ['coral','blue','mint','yellow','lavender','peach','teal','rose','lilac','lime','slate','ink'];

function showToast(message){ toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(()=>toast.classList.remove('show'), 1800); }
function apiOptions(options={}){ return {...options, credentials:'include'}; }
function save(){ maps[activeMapId]=map; localStorage.setItem('mindfold-maps', JSON.stringify({maps,activeMapId})); stateLabel.textContent='已保存'; clearTimeout(save.timer); save.timer=setTimeout(()=>syncRemote(),250); }
function load(){ try { const stored=JSON.parse(localStorage.getItem('mindfold-maps')); if(stored?.maps){maps=stored.maps;activeMapId=stored.activeMapId||Object.keys(maps)[0];map=maps[activeMapId];} else { const old=JSON.parse(localStorage.getItem('mindfold-map')); if(old?.nodes?.length){maps={default:old};map=old;} } } catch {} if(!map?.nodes?.length){maps={default:map};} titleInput.value=map.title; }
async function syncRemote(){ if(syncing)return; syncing=true; try{ if(window.MINDFOLD_DIRECT_B2){await MindfoldB2.statePut({maps,activeMapId});stateLabel.textContent='已同步';}else{ const response=await fetch(SYNC_URL,apiOptions({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({maps,activeMapId})})); if(response.ok) stateLabel.textContent='已同步'; }}catch(error){if(error.message!=='B2 credentials required')showToast('同步失败，请检查 B2 配置');} finally{syncing=false;} }
async function pullRemote(){ try{const remote=window.MINDFOLD_DIRECT_B2?await MindfoldB2.stateGet():await (async()=>{const response=await fetch(SYNC_URL,apiOptions({cache:'no-store'}));return response.ok?response.json():null;})(); if(remote?.maps&&JSON.stringify(remote.maps)!==JSON.stringify(maps)){maps=remote.maps;activeMapId=remote.activeMapId||Object.keys(maps)[0];map=maps[activeMapId];titleInput.value=map.title;render();showToast('已同步最新数据');}}catch(error){if(error.message!=='B2 credentials required')showToast('读取同步数据失败');} }
async function loadAttachments(){ try{if(window.MINDFOLD_DIRECT_B2){attachments=await MindfoldB2.files();renderAttachments();return;}const response=await fetch(`${SYNC_ORIGIN}/api/files`,apiOptions({cache:'no-store'})); if(response.ok){attachments=await response.json();renderAttachments();}}catch(error){if(error.message!=='B2 credentials required')showToast('读取附件失败');} }
function renderAttachments(){ attachmentList.innerHTML=attachments.length?attachments.map(file=>`<button class="attachment-item ${selectedFile?.path===file.path?'active':''}" data-file-path="${file.path}">${file.name}</button>`).join(''):'<span class="empty-attachments">暂无附件</span>'; }
function isTextFile(file){ return /\.(txt|md|markdown|json|csv|js|ts|py|html|css|xml|yaml|yml)$/i.test(file.name); }
async function openFile(path){ try{const response=window.MINDFOLD_DIRECT_B2?await MindfoldB2.fileGet(path):await fetch(`${SYNC_ORIGIN}/api/file?path=${encodeURIComponent(path)}`,apiOptions()); if(!window.MINDFOLD_DIRECT_B2&&!response.ok){showToast('请先配置云端服务');return;} selectedFile=window.MINDFOLD_DIRECT_B2?response:await response.json(); const name=selectedFile.name||path; fileMeta.textContent=name; nodeInspector.hidden=true; fileInspector.hidden=false; fileImage.hidden=true; filePdf.hidden=true; fileEditor.hidden=true; fileDownload.hidden=true; fileSave.hidden=true; const raw=selectedFile.content; if(/\.(png|jpe?g|gif|webp|svg)$/i.test(name)){fileImage.src=`data:${mimeFor(name)};base64,${raw}`;fileImage.hidden=false;} else if(/\.pdf$/i.test(name)){filePdf.src=`data:application/pdf;base64,${raw}`;filePdf.hidden=false;} else if(isTextFile({name})){fileEditor.value=decodeBase64(raw);fileEditor.hidden=false;fileSave.hidden=false;} else {fileDownload.hidden=false;} renderAttachments();}catch(error){if(error.message!=='B2 credentials required')showToast('附件打开失败');} }
function mimeFor(name){const ext=name.split('.').pop().toLowerCase();return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'}[ext]||'application/octet-stream';}
function decodeBase64(value){return decodeURIComponent(escape(atob(value)));}
async function uploadFile(file){const path=`attachments/${file.name}`; const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);}); try{if(window.MINDFOLD_DIRECT_B2)await MindfoldB2.filePost(path,content);else{const response=await fetch(`${SYNC_ORIGIN}/api/file`,apiOptions({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,content})}));if(!response.ok)throw new Error('upload failed');}showToast('附件已上传');loadAttachments();}catch(error){if(error.message!=='B2 credentials required')showToast('上传失败，请检查 B2 凭据和 CORS');}}
function nodeById(id){ return map.nodes.find(n=>n.id===id); }
function fitPoint(node){ return { x: node.x * zoom, y: node.y * zoom }; }
function render(){
  mapList.innerHTML = Object.entries(maps).map(([id,item])=>`<div class="map-row"><button class="map-item ${id===activeMapId?'active':''}" data-map-id="${id}"><i class="map-dot"></i><span>${item.title || '未命名画布'}</span></button><button class="map-delete" data-delete-map="${id}" title="删除画布">×</button></div>`).join('');
  layer.innerHTML='';
  map.nodes.forEach(node=>{
    const el=document.createElement('div'); el.className='node'+(node.root?' root':'')+(node.id===selectedId?' selected':''); el.dataset.id=node.id; el.dataset.color=node.color; el.textContent=node.text; el.style.left=`${node.x}px`; el.style.top=`${node.y}px`; el.addEventListener('pointerdown', startDrag); el.addEventListener('dblclick', editNode); layer.appendChild(el);
  });
  layer.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`; svg.style.transform=`translate(${panX}px,${panY}px)`; drawConnections(); updateInspector(); $('#node-count').textContent=`${map.nodes.length} 个节点`; save();
}
function drawConnections(){
  const rect=canvas.getBoundingClientRect(); svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`); svg.innerHTML='';
  map.nodes.filter(n=>n.parent).forEach(node=>{ const parent=nodeById(node.parent); const a=fitPoint(parent), b=fitPoint(node); const parentEl=layer.querySelector(`[data-id="${parent.id}"]`), nodeEl=layer.querySelector(`[data-id="${node.id}"]`); if(!parentEl||!nodeEl)return; const aw=parentEl.offsetWidth*zoom, ah=parentEl.offsetHeight*zoom, bw=nodeEl.offsetWidth*zoom, bh=nodeEl.offsetHeight*zoom; const startX = b.x > a.x ? a.x+aw : a.x, endX = b.x > a.x ? b.x : b.x+bw; const startY=a.y+ah/2, endY=b.y+bh/2; const curve=Math.max(35,Math.abs(endX-startX)*.42); const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',`M ${startX} ${startY} C ${startX+(b.x>a.x?curve:-curve)} ${startY}, ${endX+(b.x>a.x?-curve:curve)} ${endY}, ${endX} ${endY}`); path.setAttribute('class','connection'); svg.appendChild(path); });
}
function updateInspector(){ const node=nodeById(selectedId); if(!node)return; nodeText.value=node.text; document.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===node.color)); }
function selectNode(id){ selectedId=id; render(); canvas.focus(); }
function startDrag(e){ if(document.querySelector('[data-tool].active')?.dataset.tool==='hand') return; e.stopPropagation(); selectedId=e.currentTarget.dataset.id; const node=nodeById(selectedId); dragging={node, startX:e.clientX, startY:e.clientY, x:node.x, y:node.y}; e.currentTarget.classList.add('selected'); try{ e.currentTarget.setPointerCapture(e.pointerId); }catch{} }
function drag(e){ if(!dragging)return; dragging.node.x=dragging.x+(e.clientX-dragging.startX)/zoom; dragging.node.y=dragging.y+(e.clientY-dragging.startY)/zoom; const el=layer.querySelector(`[data-id="${dragging.node.id}"]`); el.style.left=`${dragging.node.x}px`; el.style.top=`${dragging.node.y}px`; drawConnections(); }
function stopDrag(){ if(!dragging)return; dragging=null; save(); }
function editNode(e){ e.stopPropagation(); const node=nodeById(e.currentTarget.dataset.id); const text=prompt('编辑节点',node.text); if(text?.trim()){ node.text=text.trim(); render(); } }
function addNode(kind='child'){ const parent=nodeById(selectedId)||map.nodes[0]; const same=map.nodes.filter(n=>n.parent===parent.id).length; const id=`node-${Date.now()}`; const angle=kind==='child' ? (same%2===0?-.55:.55) : .2; const node={id,text:kind==='child'?'新的分支':'新的想法',x:parent.x+(kind==='child'?260:-220),y:parent.y+same*78-((same-1)*39),color:colors[(map.nodes.length)%4+1],parent:kind==='child'?parent.id:parent.parent}; map.nodes.push(node); selectedId=id; render(); requestAnimationFrame(()=>{ const el=layer.querySelector(`[data-id="${id}"]`); el?.focus(); editNode({currentTarget:el,stopPropagation(){}}); }); }
function deleteSelected(){ if(selectedId==='root'){showToast('中心节点不能删除');return} const removeIds=new Set([selectedId]); let changed=true; while(changed){changed=false; map.nodes.forEach(n=>{if(removeIds.has(n.parent)&&!removeIds.has(n.id)){removeIds.add(n.id);changed=true}})} map.nodes=map.nodes.filter(n=>!removeIds.has(n.id)); selectedId='root'; render(); showToast('节点已删除'); }
function setZoom(next){ zoom=Math.min(1.6,Math.max(.55,next)); $('#zoom-label').textContent=`${Math.round(zoom*100)}%`; render(); }
function centerRoot(){ const root=nodeById('root'); if(!root)return; const rect=canvas.getBoundingClientRect(); root.x=(rect.width/zoom-180)/2; root.y=(rect.height/zoom-90)/2; panX=0; panY=0; render(); showToast('中心节点已回到画布中心'); }
function switchMap(id){ if(!maps[id])return; activeMapId=id; map=maps[id]; selectedId='root'; panX=0; panY=0; titleInput.value=map.title; render(); }
function deleteMap(id){ const ids=Object.keys(maps); if(ids.length===1){showToast('至少保留一个画布');return} if(!confirm(`确定删除“${maps[id].title||'未命名画布'}”吗？`))return; delete maps[id]; if(id===activeMapId){activeMapId=Object.keys(maps)[0];map=maps[activeMapId];titleInput.value=map.title;} selectedId='root'; render(); syncRemote(); showToast('画布已删除'); }
function exportPng(){ const data=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="100%" height="100%" fill="#f4f1e8"/><text x="48" y="58" font-family="Georgia" font-size="28" font-weight="bold">${map.title}</text>${map.nodes.map(n=>`<rect x="${n.x+300}" y="${n.y+100}" width="160" height="54" rx="12" fill="${n.color==='coral'?'#f3b09e':n.color==='blue'?'#b8d3e0':n.color==='mint'?'#b8d2c6':n.color==='yellow'?'#f2dda0':'#363934'}"/><text x="${n.x+318}" y="${n.y+132}" font-family="Georgia" font-size="15">${n.text.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>`).join('')}</svg>`; const blob=new Blob([data],{type:'image/svg+xml'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`${map.title||'mindmap'}.svg`; link.click(); showToast('已导出 SVG 文件'); }

$('#add-child').onclick=()=>addNode('child'); $('#add-sibling').onclick=()=>addNode('sibling'); $('#delete-node').onclick=deleteSelected; $('#center-root').onclick=centerRoot; $('#zoom-in').onclick=()=>setZoom(zoom+.1); $('#zoom-out').onclick=()=>setZoom(zoom-.1); $('#zoom-fit').onclick=()=>setZoom(1); $('#export-button').onclick=exportPng; $('#share-button').onclick=()=>{navigator.clipboard?.writeText(location.href);showToast('链接已复制');}; $('#new-map').onclick=()=>{const id=`map-${Date.now()}`;map={title:'未命名画布',nodes:[{id:'root',text:'从这里开始',x:390,y:230,color:'coral',parent:null,root:true}]};maps[id]=map;activeMapId=id;selectedId='root';render();}; $('#close-inspector').onclick=()=>inspector.classList.toggle('closed'); $('#theme-toggle').onclick=()=>document.body.classList.toggle('night');
$('#cloud-login').onclick=()=>{if(window.MINDFOLD_DIRECT_B2){try{MindfoldB2.askCredentials();showToast('B2 凭据已准备');loadAttachments();}catch{showToast('需要输入 B2 凭据');}return;}if(!SYNC_ORIGIN){showToast('请先配置云端同步服务');return;}window.location.href=`${SYNC_ORIGIN}/auth/login`;};
titleInput.oninput=()=>{map.title=titleInput.value;save()}; nodeText.oninput=()=>{const node=nodeById(selectedId);if(node){node.text=nodeText.value;const el=layer.querySelector(`[data-id="${selectedId}"]`);if(el)el.textContent=node.text;drawConnections();save();}};
document.querySelectorAll('.swatch').forEach(s=>s.onclick=()=>{const n=nodeById(selectedId);n.color=s.dataset.color;render()}); document.querySelectorAll('.segmented button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.segmented button').forEach(x=>x.classList.remove('active'));b.classList.add('active')}); document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tool]').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
canvas.addEventListener('dblclick',e=>{if(e.target!==canvas&&e.target!==layer)return; const rect=canvas.getBoundingClientRect(); map.nodes.push({id:`node-${Date.now()}`,text:'新的想法',x:(e.clientX-rect.left-panX)/zoom-65,y:(e.clientY-rect.top-panY)/zoom-24,color:'yellow',parent:null}); selectedId=map.nodes.at(-1).id;render();}); canvas.addEventListener('pointerdown',e=>{if(e.target!==canvas&&e.target!==layer)return; panning={x:e.clientX,y:e.clientY,panX,panY}; canvas.classList.add('dragging'); try{canvas.setPointerCapture(e.pointerId)}catch{}}); canvas.addEventListener('pointermove',e=>{if(!panning)return; panX=panning.panX+(e.clientX-panning.x); panY=panning.panY+(e.clientY-panning.y); layer.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`; svg.style.transform=`translate(${panX}px,${panY}px)`;}); canvas.addEventListener('wheel',e=>{e.preventDefault(); const rect=canvas.getBoundingClientRect(); const oldZoom=zoom; const nextZoom=Math.min(1.6,Math.max(.55,zoom+(e.deltaY<0?.1:-.1))); const x=e.clientX-rect.left; const y=e.clientY-rect.top; panX=x-(x-panX)*(nextZoom/oldZoom); panY=y-(y-panY)*(nextZoom/oldZoom); zoom=nextZoom; $('#zoom-label').textContent=`${Math.round(zoom*100)}%`; layer.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`; svg.style.transform=`translate(${panX}px,${panY}px)`; drawConnections(); save();},{passive:false}); canvas.addEventListener('pointerup',()=>{panning=null; canvas.classList.remove('dragging'); save();}); canvas.addEventListener('pointercancel',()=>{panning=null; canvas.classList.remove('dragging');}); document.addEventListener('pointermove',e=>{if(dragging)drag(e);}); document.addEventListener('pointerup',stopDrag); document.addEventListener('pointercancel',stopDrag);
mapList.addEventListener('click',e=>{const mapButton=e.target.closest('[data-map-id]'); const deleteButton=e.target.closest('[data-delete-map]'); if(mapButton)switchMap(mapButton.dataset.mapId); if(deleteButton)deleteMap(deleteButton.dataset.deleteMap);}); document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Tab'){e.preventDefault();addNode('child')}else if(e.key==='Enter')addNode('sibling');else if(e.key==='Backspace'||e.key==='Delete')deleteSelected();else if(e.key===' '){e.preventDefault();canvas.focus();showToast('画布已聚焦')}else if(e.key==='Escape')selectedId='root';});
attachmentList.addEventListener('click',e=>{const item=e.target.closest('[data-file-path]');if(item)openFile(item.dataset.filePath);}); uploadInput.addEventListener('change',e=>Array.from(e.target.files).forEach(uploadFile)); fileDownload.addEventListener('click',()=>{if(!selectedFile)return;const link=document.createElement('a');link.href=`data:application/octet-stream;base64,${selectedFile.content}`;link.download=selectedFile.name;link.click();}); fileSave.addEventListener('click',async()=>{if(!selectedFile)return;const content=btoa(unescape(encodeURIComponent(fileEditor.value)));try{if(window.MINDFOLD_DIRECT_B2)await MindfoldB2.filePut(selectedFile.path,content);else{const response=await fetch(`${SYNC_ORIGIN}/api/file`,apiOptions({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:selectedFile.path,sha:selectedFile.sha,content})}));if(!response.ok)throw new Error('save failed');}showToast('文件已保存');openFile(selectedFile.path);}catch{showToast('保存失败，请检查 B2 凭据和 CORS');}});
window.addEventListener('resize',drawConnections); load(); render(); pullRemote(); loadAttachments(); setInterval(pullRemote,3000);
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
