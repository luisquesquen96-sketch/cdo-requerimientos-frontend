(() => {
  const C=window.CDO_CONFIG;
  const sb=supabase.createClient(C.url,C.key,{auth:{persistSession:true,autoRefreshToken:true}});
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtDate=v=>v?new Date(v+'T00:00:00').toLocaleDateString('es-PE'):'—';
  const num=v=>Number(v||0).toLocaleString('es-PE',{maximumFractionDigits:2});
  // El catálogo actual conserva los nombres del Excel, pero la tabla measurement_units
  // aún no tiene registros. Para no modificar datos, mostramos la unidad inferida
  // únicamente como respaldo visual a partir del nombre del material.
  function inferUnit(name){
    const n=String(name||'').toLowerCase();
    if(/\b(metros|metro)\b|\(metros\)/.test(n))return 'Metro';
    if(/\b(mill(ar|ar de)|millar)\b/.test(n))return 'Millar';
    if(/\bpliegos?\b/.test(n))return 'Pliego';
    if(/\bpaquetes?\b|\(paquete/.test(n))return 'Paquete';
    if(/\bdocena\b/.test(n))return 'Docena';
    if(/\bfrascos?\b|\(frascos?|\(frasco/.test(n))return 'Frasco';
    if(/\bbolsas?\b|\(bolsas?\)/.test(n))return 'Bolsa';
    if(/\bpiezas?\b|\(pieza\)/.test(n))return 'Pieza';
    if(/\bestuche\b/.test(n))return 'Estuche';
    if(/\bpote\b/.test(n))return 'Pote';
    return 'Unidad';
  }
  function historicalGrade(recipient){
    const r=String(recipient||'').toLowerCase();
    if(/cuarto de primaria/.test(r))return '4°P · Única';
    if(/primero a/.test(r)||/1a\b/.test(r))return '1°AP · A';
    if(/1p\.?b/.test(r))return '1°BP · B';
    if(/3a\b/.test(r))return '3°AP · A';
    if(/3b\b/.test(r))return '3°BP · B';
    if(/5a\b/.test(r))return '5°AP · A';
    if(/2b\b/.test(r))return '2°BP · B';
    if(/2pa\b/.test(r))return '2°AP · A';
    if(/5 años/.test(r))return '5 Años · Única';
    if(/inicial 3,? 4 y 5/.test(r))return 'Inicial · 3, 4 y 5 años';
    if(/docentes de 1a y 1b/.test(r))return '1°AP · A + 1°BP · B';
    if(/docentes del primaria - 3a y 3b/.test(r))return '3°AP · A + 3°BP · B';
    if(/nursery/.test(r))return 'Inicial · Nursery';
    return '—';
  }
  function sourceStatusBadge(status){
    const map={'Completo':'ok','Incompleto':'warn','No entregó nada':'danger'};
    return `<span class="badge ${map[status]||'gray'}">${esc(status||'—')}</span>`;
  }
  const roleLabel={administrador:'Administrador',responsable_almacen:'Responsable de almacén',consulta_reportes:'Consulta / reportes'};
  const state={user:null,profile:null,institution:null,year:null,years:[],view:'dashboard',page:0,pageSize:25,cache:{}};
  const menus=[
    ['dashboard','▦','Dashboard'],['years','◷','Años académicos'],['students','◉','Alumnos'],['enrollments','▤','Matrículas'],
    ['teachers','♙','Docentes'],['assignments','↔','Asignaciones'],['areas','⌂','Áreas'],['materials','▧','Materiales'],
    ['categories','◇','Categorías'],['units','◌','Unidades'],['warehouses','▥','Almacenes'],['inventory','▣','Inventario'],
    ['kardex','≋','Kardex'],['requisitions','▦','Requerimientos'],['deliveries','⇩','Entregas'],['acts','▤','Actas'],
    ['supplies','✓','Útiles por alumno'],['reports','▤','Reportes'],['alerts','!','Alertas'],['users','♙','Usuarios'],['backups','⤓','Respaldos'],['settings','⚙','Configuración']
  ];
  const writeRoles=['administrador','responsable_almacen'];
  const adminOnly=['administrador'];
  const canWrite=()=>writeRoles.includes(state.profile?.role);
  const isAdmin=()=>state.profile?.role==='administrador';
  function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('toast-show');setTimeout(()=>e.classList.remove('toast-show'),2600)}
  function err(e){console.error(e);toast(e?.message||'Ocurrió un error')}
  function openModal(title,body,actions=''){ $('#modal').innerHTML=`<div class="modal-backdrop"><div class="modal-card"><div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" data-close>×</button></div><div class="modal-body">${body}</div>${actions?`<div class="modal-head" style="justify-content:flex-end;gap:8px">${actions}</div>`:''}</div></div>`;$('#modal').querySelectorAll('[data-close]').forEach(b=>b.onclick=closeModal); }
  function closeModal(){$('#modal').innerHTML=''}
  $('#modal').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()});
  function setNav(){ $('#nav').innerHTML=menus.map(([id,ico,label])=>`<button data-view="${id}" class="${state.view===id?'active':''}"><span class="ico">${ico}</span><span>${label}</span></button>`).join('');$$('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.page=0;render()}) }
  function setTitle(){const m=menus.find(x=>x[0]===state.view);$('#pageTitle').textContent=m?.[2]||'Dashboard'}
  function requireAuth(){if(!state.user){loginScreen();return false}return true}
  async function loadProfile(){
    const {data,error}=await sb.from('user_profiles').select('id,institution_id,full_name,role,active').eq('id',state.user.id).maybeSingle();
    if(error)throw error;if(!data||!data.active)throw new Error('Tu usuario no tiene un perfil activo.');
    state.profile=data;
    if(data.institution_id){const r=await sb.from('institutions').select('id,name,short_name,active').eq('id',data.institution_id).single();if(r.error)throw r.error;state.institution=r.data}
    const y=await sb.from('academic_years').select('id,year,status').eq('institution_id',data.institution_id).order('year',{ascending:false});
    if(y.error)throw y.error;state.years=y.data||[];state.year=Number(localStorage.cdoYear)||state.years.find(x=>x.status==='active')?.year||C.year;
    if(!state.years.some(x=>x.year===state.year)&&state.years[0])state.year=state.years[0].year;
    $('#yearSelect').innerHTML=state.years.map(y=>`<option value="${y.year}" ${y.year===state.year?'selected':''}>${y.year}</option>`).join('');
    $('#userChip').innerHTML=`<span class="user-chip">${esc(data.full_name||state.user.email||'Usuario')} · ${esc(roleLabel[data.role]||data.role)} <button id="logout">Salir</button></span>`;
    $('#logout').onclick=()=>sb.auth.signOut();
  }
  function loginScreen(){
    $('#app').hidden=true;$('#login').innerHTML=`<div class="login"><div class="login-card"><div class="brand-lg"><b>CDO</b><div><h2>Gestión Administrativa</h2><p>Almacén · Inventario · Requerimientos</p></div></div><div class="notice">Acceso protegido por Supabase Auth. No hay credenciales ni datos precargados en el frontend.</div><form id="loginForm"><div class="field"><label>Correo</label><input id="email" type="email" autocomplete="username" required></div><div class="field" style="margin-top:12px"><label>Contraseña</label><input id="password" type="password" autocomplete="current-password" required></div><button class="btn primary" style="width:100%;margin-top:16px">Ingresar</button><p id="loginMsg" style="font-size:11px;color:#b83a3a"></p></form></div></div>`;
    $('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='';const {error}=await sb.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});if(error)$('#loginMsg').textContent=error.message}
  }
  async function init(){
    // Online-only: remove any legacy service worker/cache left by an older deployment.
    if('serviceWorker' in navigator){try{const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.unregister()));}catch(e){console.warn('No se pudo limpiar Service Worker',e)}}
    if(window.caches){try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('cdo-shell-')).map(k=>caches.delete(k)));}catch(e){console.warn('No se pudo limpiar cache legacy',e)}}
    $('#yearSelect').onchange=()=>{state.year=+$('#yearSelect').value;localStorage.cdoYear=state.year;state.page=0;render()};
    $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    sb.auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;if(!state.user){loginScreen();return}try{await loadProfile();$('#login').innerHTML='';$('#app').hidden=false;setNav();render();/* Online-only: no service worker/offline cache. */}catch(e){err(e);await sb.auth.signOut()}});
    const {data:{session}}=await sb.auth.getSession();if(session){state.user=session.user;try{await loadProfile();$('#app').hidden=false;setNav();render()}catch(e){err(e);await sb.auth.signOut()}}else loginScreen();
  }
  async function count(table,filters=[]){let q=sb.from(table).select('*',{count:'exact',head:true});for(const [op,k,v] of filters){q=op==='eq'?q.eq(k,v):op==='in'?q.in(k,v):q}const r=await q;if(r.error)throw r.error;return r.count||0}
  async function list(table,cols,opts={}){let q=sb.from(table).select(cols,{count:'exact'});(opts.filters||[]).forEach(([op,k,v])=>{q=op==='eq'?q.eq(k,v):op==='ilike'?q.ilike(k,v):op==='gte'?q.gte(k,v):op==='lte'?q.lte(k,v):op==='in'?q.in(k,v):q});if(opts.order)q=q.order(opts.order,{ascending:opts.asc!==false});const from=(opts.page||0)*(opts.size||25),to=from+(opts.size||25)-1;q=q.range(from,to);const r=await q;if(r.error)throw r.error;return r}
  async function getYearId(){return state.years.find(y=>y.year===state.year)?.id||null}
  const levelOrder={'nursery':1,'inicial':1,'3 años':1,'3 anos':1,'4 años':2,'4 anos':2,'5 años':3,'5 anos':3,'primaria':4,'secundaria':5};
  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
  function gradeRank(level,grade){const l=norm(level),g=norm(grade);if(l.includes('nursery')||l.includes('3 anos')||g.includes('3 anos'))return 1;if(l.includes('inicial')&&g.includes('4 anos')||g.includes('4 anos'))return 2;if(l.includes('inicial')&&g.includes('5 anos')||g.includes('5 anos'))return 3;const n=parseInt(g.match(/\d+/)?.[0]||'99',10);return (l.includes('primaria')?3:(l.includes('secundaria')?4:9))*100+n}
  function compareClass(a,b){const al=a?.sections?.grades?.levels?.name||a?.level_name||'', bl=b?.sections?.grades?.levels?.name||b?.level_name||'';const ag=a?.sections?.grades?.name||a?.class_name||'', bg=b?.sections?.grades?.name||b?.class_name||'';const r=gradeRank(al,ag)-gradeRank(bl,bg);return r||String(ag).localeCompare(String(bg),'es',{numeric:true})||String(a?.sections?.name||'').localeCompare(String(b?.sections?.name||''),'es',{numeric:true})}

  async function render(){if(!requireAuth())return;setNav();setTitle();$('#sidebar').classList.remove('open');try{const fn=views[state.view]||views.dashboard;await fn()}catch(e){$('#content').innerHTML=`<div class="danger-box">No se pudo cargar esta pantalla: ${esc(e.message)}</div>`;console.error(e)}}
  function pageHead(title,desc,actions=''){return `<div class="page-head"><div><h2>${esc(title)}</h2>${desc?`<p>${esc(desc)}</p>`:''}</div><div class="actions">${actions}</div></div>`}
  function table(data,heads,rows){return `<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${heads.length}" class="empty">Sin registros.</td></tr>`}</tbody></table></div>`}
  function pager(count){const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));return `<div class="pagination"><span>${count||0} registro(s) · página ${state.page+1} de ${pages}</span><div><button class="btn ghost sm" data-prev ${state.page===0?'disabled':''}>Anterior</button><button class="btn ghost sm" data-next ${state.page>=pages-1?'disabled':''}>Siguiente</button></div></div>`}
  function bindPager(count,rerender){const pages=Math.max(1,Math.ceil((count||0)/state.pageSize));$('[data-prev]')?.addEventListener('click',()=>{if(state.page>0){state.page--;rerender()}});$('[data-next]')?.addEventListener('click',()=>{if(state.page<pages-1){state.page++;rerender()}})}
  function kpi(label,value,cls='',note=''){return `<div class="kpi ${cls}"><div class="label">${esc(label)}</div><strong>${num(value)}</strong><small>${esc(note)}</small></div>`}
  async function dashboard(){
    const iy=await getYearId();
    const yearFilter=iy?[['eq','academic_year_id',iy]]:[];
    const [students,reqs,pending,materials,stocks,moves,openAlerts,historicalReqs]=await Promise.all([
      count('students',[['eq','institution_id',state.institution.id]]),
      count('requisitions',yearFilter),
      count('requisitions',[['in','status',['enviado','aprobado','en_atencion','parcial']]]),
      count('materials',[['eq','institution_id',state.institution.id]]),
      count('inventory_stocks',yearFilter),
      count('inventory_movements',yearFilter),
      count('alerts',[['eq','institution_id',state.institution.id],['eq','resolved',false]]),
      count('historical_requisitions',[['eq','institution_id',state.institution.id]])
    ]);
    const [{data:stock},{data:recent},{data:studentStatus}]=await Promise.all([
      sb.from('v_inventory_status').select('current_quantity,minimum_quantity,stock_status').eq('academic_year_id',iy).limit(100),
      sb.from('requisitions').select('id,number,request_date,status,teachers(full_name)').eq('academic_year_id',iy).order('created_at',{ascending:false}).limit(6),
      sb.from('v_student_material_status').select('status').eq('academic_year_id',iy).limit(500)
    ]);
    const critical=(stock||[]).filter(x=>String(x.stock_status||'').toLowerCase().includes('critical')||Number(x.current_quantity)<=Number(x.minimum_quantity)).length;
    const risk=(stock||[]).filter(x=>Number(x.current_quantity)>Number(x.minimum_quantity)&&Number(x.current_quantity)<Number(x.minimum_quantity)*1.5).length;
    const complete=(studentStatus||[]).filter(x=>x.status==='completo').length;
    const incomplete=(studentStatus||[]).filter(x=>x.status==='incompleto').length;
    const none=(studentStatus||[]).filter(x=>x.status==='no_entrego_nada'||x.status==='no entregó nada').length;
    const totalStudentStatuses=(studentStatus||[]).length||1;
    const pct=n=>Math.round((n/totalStudentStatuses)*100);
    const bar=(label,value,total,cls='')=>`<div class="bar-row"><div><span>${esc(label)}</span><b>${num(value)}</b></div><div class="bar"><i class="${cls}" style="width:${Math.min(100,total?value/total*100:0)}%"></i></div></div>`;
    $('#content').innerHTML=pageHead('Dashboard',`${state.institution?.name||C.institutionName} · año ${state.year}`)+
      `<div class="kpis">${kpi('Alumnos',students,'','Registrados en el sistema')}${kpi('Requerimientos',reqs,'','Registrados en el año')}${kpi('Pendientes',pending,'warn','Por atender')}${kpi('Stock crítico',critical,'danger','Actual ≤ mínimo')}${kpi('Materiales',materials,'','Catálogo maestro')}${kpi('Histórico PDF',historicalReqs,'','Requisiciones históricas')}</div>
      <div class="chart-grid"><div class="panel"><div class="page-head"><div><h2>Estado de útiles</h2><p>Distribución calculada por Supabase</p></div><span class="badge ok">${pct(complete)}% completos</span></div>${bar('Completos',complete,totalStudentStatuses,'ok')}${bar('Incompletos',incomplete,totalStudentStatuses,'warn')}${bar('Sin entrega',none,totalStudentStatuses,'danger')}</div>
      <div class="panel"><div class="page-head"><div><h2>Inventario</h2><p>Situación de las posiciones del año</p></div></div>${bar('Normal',Math.max(0,stocks-critical-risk),stocks,'ok')}${bar('En riesgo',risk,stocks,'warn')}${bar('Crítico',critical,stocks,'danger')}<div class="mini-stats"><div><b>${num(moves)}</b><small>movimientos</small></div><div><b>${num(openAlerts)}</b><small>alertas abiertas</small></div></div></div></div>
      <div class="panel" style="margin-top:14px"><div class="page-head"><div><h2>Actividad reciente</h2><p>Últimos requerimientos registrados</p></div><button class="btn secondary sm" data-go="requisitions">Ver requerimientos</button></div>${recent?.length?table(recent,['N.º','Fecha','Docente','Estado'],recent.map(r=>`<tr><td><b>RQ-${state.year}-${String(r.number).padStart(4,'0')}</b></td><td>${fmtDate(r.request_date)}</td><td>${esc(r.teachers?.full_name||'—')}</td><td>${badge(r.status)}</td></tr>`).join('')):`<div class="empty">No hay requerimientos registrados.</div>`}</div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>{state.view=b.dataset.go;state.page=0;render()});
  }
  function badge(s){const cls=['atendido','completo','confirmado'].includes(s)?'ok':['parcial','aprobado','enviado','probable'].includes(s)?'warn':['cancelado','critical','no_corresponde'].includes(s)?'danger':'gray';return `<span class="badge ${cls}">${esc(String(s||'').replaceAll('_',' ').toUpperCase())}</span>`}
  async function years(){const r=await list('academic_years','id,year,status,starts_on,ends_on',{filters:[['eq','institution_id',state.institution.id]],order:'year',asc:false,page:0,size:50});$('#content').innerHTML=pageHead('Años académicos','Cada año mantiene su propia matrícula, inventario y operaciones.',isAdmin()?`<button class="btn primary" id="addYear">+ Nuevo año</button>`:'')+table(r.data,['Año','Estado','Inicio','Fin'],(r.data||[]).map(y=>`<tr><td><b>${y.year}</b></td><td>${badge(y.status)}</td><td>${fmtDate(y.starts_on)}</td><td>${fmtDate(y.ends_on)}</td></tr>`).join(''));if(isAdmin())$('#addYear').onclick=()=>openYear()}
  function openYear(){openModal('Preparar año académico',`<div class="grid"><div class="field"><label>Año</label><input id="yYear" type="number" value="${state.year+1}"></div><div class="field"><label>Copiar asignaciones desde</label><select id="yCopy"><option value="">No copiar</option>${state.years.map(y=>`<option value="${y.year}">${y.year}</option>`).join('')}</select></div></div><div class="notice" style="margin-top:12px">El nuevo año inicia como BORRADOR. El catálogo maestro de materiales es compartido; el inventario y las listas de útiles son independientes.</div>`,`<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="saveYear">Crear</button>`);$('#saveYear').onclick=async()=>{try{const y=+$('#yYear').value;const {error}=await sb.rpc('prepare_new_academic_year',{p_institution:state.institution.id,p_year:y,p_copy_from:$('#yCopy').value?+$('#yCopy').value:null});if(error)throw error;closeModal();await loadProfile();toast('Año preparado');state.year=y;render()}catch(e){err(e)}}}
  async function students(){
    const search=state._search||'';
    let q=sb.from('students').select('id,permanent_code,first_name,last_name,active',{count:'exact'}).eq('institution_id',state.institution.id);
    if(search) q=q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,permanent_code.ilike.%${search}%`);
    const r=await q.order('last_name').order('first_name').range(state.page*state.pageSize,(state.page+1)*state.pageSize-1);
    if(r.error)throw r.error;
    $('#content').innerHTML=pageHead('Alumnos','Identidad permanente; la matrícula se registra por año.',isAdmin()?`<button class="btn primary" id="addStudent">+ Alumno</button>`:'')+
      `<div class="toolbar"><div class="field grow"><label>Buscar</label><input class="search" id="search" placeholder="Nombre, apellido o código" value="${esc(search)}"></div><button class="btn secondary" id="find">Buscar</button></div>`+
      table(r.data,['Código','Apellidos','Nombres','Estado','Acciones'],(r.data||[]).map(s=>`<tr class="student-row"><td class="mono">${esc(s.permanent_code||'—')}</td><td class="student-last">${esc(s.last_name||'')}</td><td class="student-first">${esc(s.first_name||'')}</td><td>${s.active?'<span class="badge ok">ACTIVO</span>':'<span class="badge gray">INACTIVO</span>'}</td><td><button class="btn ghost sm" data-stu="${s.id}">Ver</button></td></tr>`).join(''))+
      pager(r.count);
    $('#find').onclick=()=>{state._search=$('#search').value.trim();state.page=0;students()};
    $('#search').onkeydown=e=>{if(e.key==='Enter')$('#find').click()};
    bindPager(r.count,students);
    $$('[data-stu]').forEach(b=>b.onclick=()=>studentDetail(b.dataset.stu));
    if(isAdmin())$('#addStudent').onclick=()=>studentForm();
  }

  function studentForm(id=null,row={},onSaved=null){
    openModal(id?'Editar alumno':'Nuevo alumno',`<div class="grid">
      <div class="field"><label>Nombres</label><input id="sf" value="${esc(row.first_name||'')}" autocomplete="given-name"></div>
      <div class="field"><label>Apellidos</label><input id="sl" value="${esc(row.last_name||'')}" autocomplete="family-name"></div>
      <div class="field span2"><label>Código permanente <small>(opcional)</small></label><input id="sc" value="${esc(row.permanent_code||'')}" placeholder="Se puede dejar vacío para nuevo alumno"></div>
    </div>`,`<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="saveS">Guardar alumno</button>`);
    $('#saveS').onclick=async()=>{try{
      const data={first_name:$('#sf').value.trim(),last_name:$('#sl').value.trim(),permanent_code:$('#sc').value.trim()||null};
      if(!data.first_name||!data.last_name)throw new Error('Nombres y apellidos son obligatorios');
      if(!id && data.permanent_code){const dup=await sb.from('students').select('id').eq('institution_id',state.institution.id).eq('permanent_code',data.permanent_code).maybeSingle();if(dup.error)throw dup.error;if(dup.data)throw new Error('Ese código permanente ya está registrado.');}
      const r=id?await sb.from('students').update(data).eq('id',id).select().single():await sb.from('students').insert({institution_id:state.institution.id,...data}).select().single();
      if(r.error)throw r.error;closeModal();toast(id?'Alumno actualizado':'Alumno creado correctamente');if(onSaved)onSaved(r.data);else students();
    }catch(e){err(e)}}
  }

  async function enrollments(){
    const yid=await getYearId();
    const q=await sb.from('student_enrollments').select('id,status,enrollment_date,students(id,first_name,last_name,permanent_code),sections(id,name,grades(name,levels(name)))',{count:'exact'}).eq('academic_year_id',yid);
    if(q.error)throw q.error;
    const all=(q.data||[]).sort(compareClass);
    const start=state.page*state.pageSize,pageRows=all.slice(start,start+state.pageSize);
    $('#content').innerHTML=pageHead(`Matrículas ${state.year}`,'Consulta y gestión de alumnos por año.',isAdmin()?`<button class="btn primary" id="addEnroll">+ Matrícula</button>`:'')+
      table(pageRows,['Alumno','Nivel','Grado','Sección','Estado','Fecha'],pageRows.map(x=>`<tr><td class="student-cell"><b>${esc(x.students?.last_name||'')}</b>, ${esc(x.students?.first_name||'')}</td><td>${esc(x.sections?.grades?.levels?.name||'—')}</td><td>${esc(x.sections?.grades?.name||'—')}</td><td>${esc(x.sections?.name||'—')}</td><td>${badge(x.status)}</td><td>${fmtDate(x.enrollment_date)}</td></tr>`).join(''))+pager(q.count);
    bindPager(q.count,enrollments);if(isAdmin())$('#addEnroll').onclick=()=>enrollmentForm();
  }

  async function enrollmentForm(){
    const [st,sec]=await Promise.all([
      sb.from('students').select('id,first_name,last_name,permanent_code').eq('institution_id',state.institution.id).eq('active',true).order('last_name').order('first_name').limit(500),
      sb.from('sections').select('id,name,grades(name,levels(name))').eq('academic_year_id',await getYearId()).eq('active',true)
    ]);if(st.error||sec.error)throw st.error||sec.error;
    const studentOptions=rows=>(rows||[]).map(x=>`<option value="${x.id}">${esc(x.last_name)}, ${esc(x.first_name)}${x.permanent_code?` · ${esc(x.permanent_code)}`:''}</option>`).join('');
    const sectionOptions=(sec.data||[]).sort(compareClass).map(x=>`<option value="${x.id}">${esc(x.grades?.levels?.name||'')} · ${esc(x.grades?.name||'')} · ${esc(x.name)}</option>`).join('');
    openModal(`Nueva matrícula ${state.year}`,`<div class="grid">
      <div class="field span2"><label>Alumno</label><div class="inline-field"><select id="es">${studentOptions(st.data)}</select><button class="btn secondary" type="button" id="newStudentFromEnroll">+ Nuevo alumno</button></div></div>
      <div class="field span2"><label>Sección / aula</label><select id="ec">${sectionOptions}</select></div>
      <div class="field"><label>Estado</label><select id="est"><option value="nuevo_ingreso">Nuevo ingreso</option><option value="continua">Continúa</option><option value="retirado">Retirado</option><option value="traslado">Traslado</option><option value="otro">Otro</option></select></div>
      <div class="field"><label>Fecha</label><input id="ed" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    </div><div class="notice">Si el alumno no aparece en la lista, usa <b>+ Nuevo alumno</b>. Al guardarlo quedará disponible para esta matrícula.</div>`,`<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="saveE">Guardar matrícula</button>`);
    $('#newStudentFromEnroll').onclick=()=>{const selectedSection=$('#ec').value;studentForm(null,{},async created=>{await enrollmentForm();if(document.getElementById('ec'))document.getElementById('ec').value=selectedSection;if(document.getElementById('es'))document.getElementById('es').value=created.id;});};
    $('#saveE').onclick=async()=>{try{
      if(!$('#es').value||!$('#ec').value)throw new Error('Selecciona alumno y sección');
      const exists=await sb.from('student_enrollments').select('id').eq('student_id',$('#es').value).eq('academic_year_id',await getYearId()).maybeSingle();if(exists.error)throw exists.error;if(exists.data)throw new Error('El alumno ya tiene una matrícula registrada para este año.');
      const r=await sb.from('student_enrollments').insert({student_id:$('#es').value,academic_year_id:await getYearId(),section_id:$('#ec').value,status:$('#est').value,enrollment_date:$('#ed').value});if(r.error)throw r.error;closeModal();toast('Matrícula registrada');enrollments();
    }catch(e){err(e)}};
  }

  async function simpleCatalog(tableName,title,cols,fields,canEdit=true){
    const r=await list(tableName,cols.map(x=>x.key).join(','),{filters:[['eq','institution_id',state.institution.id]],order:cols[0].key,page:state.page,size:state.pageSize});
    const action=canEdit&&isAdmin()?`<button class="btn primary" id="addC">+ Nuevo</button>`:'';
    $('#content').innerHTML=pageHead(title,'Catálogo administrativo.',action)+table(r.data,[...cols.map(x=>x.label),'Acciones'],(r.data||[]).map(x=>`<tr>${cols.map(c=>`<td>${esc(x[c.key]??'—')}</td>`).join('')}<td>${isAdmin()?`<button class="btn ghost sm" data-c="${x.id}">Editar</button>`:''}</td></tr>`).join(''))+pager(r.count);
    bindPager(r.count,()=>simpleCatalog(tableName,title,cols,fields,canEdit));
    if(isAdmin()){$('#addC').onclick=()=>catalogForm(tableName,title,fields);$$('[data-c]').forEach(b=>b.onclick=async()=>{try{const z=await sb.from(tableName).select('*').eq('id',b.dataset.c).single();if(z.error)throw z.error;catalogForm(tableName,title,fields,z.data)}catch(e){err(e)}})}
  }

  function catalogForm(tableName,title,fields,row={}){
    openModal(row.id?`Editar ${title}`:`Nuevo ${title}`,`<div class="grid">${fields.map(f=>`<div class="field ${f.span?'span'+f.span:''}"><label>${f.label}</label><input id="f_${f.key}" value="${esc(row[f.key]??'')}" ${f.placeholder?`placeholder="${esc(f.placeholder)}"`:''}></div>`).join('')}</div>`,`<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="saveC">Guardar</button>`);
    $('#saveC').onclick=async()=>{try{const data={};fields.forEach(f=>data[f.key]=$('#f_'+f.key).value.trim());if(!data[fields[0].key])throw new Error(`Ingresa ${fields[0].label.toLowerCase()}`);data.institution_id=state.institution.id;const r=row.id?await sb.from(tableName).update(data).eq('id',row.id).select().single():await sb.from(tableName).insert(data).select().single();if(r.error)throw r.error;closeModal();toast(row.id?`${title} actualizado`:`${title} creado`);state.page=0;render()}catch(e){err(e)}};
  }

  async function materials(){
    const r=await sb.from('materials').select('id,code,name,active,category_id,unit_id,material_categories(name),measurement_units(name,abbreviation)',{count:'exact'}).eq('institution_id',state.institution.id).order('name').range(state.page*state.pageSize,(state.page+1)*state.pageSize-1);if(r.error)throw r.error;
    $('#content').innerHTML=pageHead('Catálogo maestro de materiales','Un material existe una sola vez; el inventario se separa por almacén y año.',isAdmin()?`<button class="btn primary" id="addM">+ Material</button>`:'')+
      table(r.data,['Código','Material','Categoría','Unidad','Estado','Acciones'],(r.data||[]).map(m=>`<tr><td class="mono">${esc(m.code||'—')}</td><td><b>${esc(m.name)}</b></td><td>${esc(m.material_categories?.name||'—')}</td><td>${esc(m.measurement_units?.name||inferUnit(m.name))}</td><td>${m.active?'<span class="badge ok">ACTIVO</span>':'<span class="badge gray">INACTIVO</span>'}</td><td>${isAdmin()?`<button class="btn ghost sm" data-m="${m.id}">Editar</button>`:''}</td></tr>`).join(''))+pager(r.count)+`<div class="panel" style="margin-top:14px"><b>Correspondencias PDF / Excel</b><p style="font-size:11px;color:var(--muted)">Las equivalencias se mantienen separadas y requieren revisión explícita. No se fusionan automáticamente.</p></div>`;
    bindPager(r.count,materials);if(isAdmin()){$('#addM').onclick=()=>materialForm();$$('[data-m]').forEach(b=>b.onclick=async()=>{try{const z=await sb.from('materials').select('*').eq('id',b.dataset.m).single();if(z.error)throw z.error;materialForm(z.data.id,z.data)}catch(e){err(e)}})}
  }

  async function materialForm(id=null,row={}){
    const [c,u]=await Promise.all([sb.from('material_categories').select('id,name').eq('institution_id',state.institution.id).eq('active',true).order('name'),sb.from('measurement_units').select('id,name,abbreviation').eq('institution_id',state.institution.id).eq('active',true).order('name')]);if(c.error||u.error)throw c.error||u.error;
    openModal(id?'Editar material':'Nuevo material',`<div class="grid"><div class="field"><label>Código</label><input id="mc" value="${esc(row.code||'')}"></div><div class="field span3"><label>Nombre</label><input id="mn" value="${esc(row.name||'')}"></div><div class="field"><label>Categoría</label><select id="mcat"><option value="">—</option>${(c.data||[]).map(x=>`<option value="${x.id}" ${row.category_id===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Unidad</label><select id="mu"><option value="">—</option>${(u.data||[]).map(x=>`<option value="${x.id}" ${row.unit_id===x.id?'selected':''}>${esc(x.name)}${x.abbreviation?` · ${esc(x.abbreviation)}`:''}</option>`).join('')}</select></div></div><div class="notice">Los cambios aquí actualizan el catálogo maestro y se reflejan en inventario, Kardex, requerimientos y reportes.</div>`,`<button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="saveM">Guardar</button>`);
    $('#saveM').onclick=async()=>{try{const data={code:$('#mc').value.trim()||null,name:$('#mn').value.trim(),category_id:$('#mcat').value||null,unit_id:$('#mu').value||null};if(!data.name)throw new Error('El nombre es obligatorio');const r=id?await sb.from('materials').update(data).eq('id',id).select().single():await sb.from('materials').insert({institution_id:state.institution.id,...data}).select().single();if(r.error)throw r.error;closeModal();toast(id?'Material actualizado':'Material creado');materials()}catch(e){err(e)}};
  }

  async function kardex(){
    const [w,m,sec,stu,yid]=await Promise.all([
      sb.from('warehouses').select('id,name,is_historical').eq('institution_id',state.institution.id).eq('active',true).order('name'),
      sb.from('materials').select('id,name,code').eq('institution_id',state.institution.id).eq('active',true).order('name').limit(500),
      sb.from('sections').select('id,name,grades(name,levels(name))').eq('academic_year_id',await getYearId()).eq('active',true),
      sb.from('students').select('id,first_name,last_name,permanent_code').eq('institution_id',state.institution.id).eq('active',true).order('last_name').order('first_name').limit(500),
      getYearId()
    ]);if(w.error||m.error||sec.error||stu.error)throw w.error||m.error||sec.error||stu.error;
    const wid=state._kW||w.data?.find(x=>!x.is_historical)?.id||w.data?.[0]?.id,mid=state._kM||m.data?.[0]?.id;
    const filters=[['warehouse_id',wid],['material_id',mid]];
    let q=sb.from('inventory_movements').select('id,movement_date,movement_type,quantity,balance_after,reference,notes,document_type,document_id,created_at').eq('warehouse_id',wid).eq('material_id',mid).eq('academic_year_id',yid).order('movement_date',{ascending:false}).order('created_at',{ascending:false}).range(0,499);
    const r=await q;if(r.error)throw r.error;
    const movementIds=(r.data||[]).map(x=>x.id);
    let deliveryMap={};
    if(movementIds.length){const di=await sb.from('requisition_delivery_items').select('inventory_movement_id,quantity,delivery_id,requisition_item_id,requisition_deliveries(delivery_date,requisition_id,requisitions(number,section_id,teacher_id,areas(name),sections(name,grades(name,levels(name))),teachers(full_name)))').in('inventory_movement_id',movementIds);if(di.error)throw di.error;(di.data||[]).forEach(x=>deliveryMap[x.inventory_movement_id]=x)}
    const selectedSection=state._kS||'',selectedStudent=state._kStu||'';
    const sectionName=id=>{const x=(sec.data||[]).find(s=>s.id===id);return x?`${x.grades?.levels?.name||''} · ${x.grades?.name||''} · ${x.name||''}`:'—'};
    const studentName=id=>{const x=(stu.data||[]).find(s=>s.id===id);return x?`${x.last_name}, ${x.first_name}`:'—'};
    const rows=(r.data||[]).filter(x=>{const d=deliveryMap[x.id];const section=d?.requisition_deliveries?.requisitions?.section_id||'';return (!selectedSection||section===selectedSection)&&(!selectedStudent||false)});
    const sectionOptions=(sec.data||[]).sort(compareClass).map(x=>`<option value="${x.id}" ${x.id===selectedSection?'selected':''}>${esc(sectionName(x.id))}</option>`).join('');
    const studentOptions=(stu.data||[]).map(x=>`<option value="${x.id}" ${x.id===selectedStudent?'selected':''}>${esc(studentName(x.id))}</option>`).join('');
    $('#content').innerHTML=pageHead('Kardex','Movimientos reales por material, almacén y distribución por aula/sección.',`<button class="btn secondary" id="printK">Imprimir / PDF</button>`)+
      `<div class="toolbar"><div class="field"><label>Almacén</label><select id="kw">${(w.data||[]).map(x=>`<option value="${x.id}" ${x.id===wid?'selected':''}>${esc(x.name)}${x.is_historical?' · HISTÓRICO':''}</option>`).join('')}</select></div><div class="field grow"><label>Material</label><select id="km">${(m.data||[]).map(x=>`<option value="${x.id}" ${x.id===mid?'selected':''}>${esc(x.name)}${x.code?` · ${esc(x.code)}`:''}</option>`).join('')}</select></div></div>
      <div class="toolbar"><div class="field grow"><label>Aula / sección</label><select id="ks"><option value="">Todas las aulas</option>${sectionOptions}</select></div><div class="field grow"><label>Alumno <small>(cuando exista relación directa)</small></label><select id="kstu"><option value="">Todos</option>${studentOptions}</select></div></div>`+
      table(rows,['Fecha','Tipo','Entrada/Salida','Saldo','Aula / sección','Documento','Observación'],rows.map(x=>{const d=deliveryMap[x.id],req=d?.requisition_deliveries?.requisitions;const qn=Number(x.quantity);return `<tr><td>${new Date(x.movement_date).toLocaleDateString('es-PE')}</td><td>${badge(x.movement_type)}</td><td class="num">${qn>0?`+${num(qn)}`:num(qn)}</td><td class="num"><b>${num(x.balance_after)}</b></td><td>${esc(req?.section_id?sectionName(req.section_id):'—')}</td><td>${esc(x.reference || (req?.number ? `RQ-${state.year}-${String(req.number).padStart(4,'0')}` : '—'))}</td><td>${esc(x.notes||'—')}</td></tr>`}).join(''));
    $('#kw').onchange=()=>{state._kW=$('#kw').value;kardex()};$('#km').onchange=()=>{state._kM=$('#km').value;kardex()};$('#ks').onchange=()=>{state._kS=$('#ks').value;kardex()};$('#kstu').onchange=()=>{state._kStu=$('#kstu').value;kardex()};$('#printK').onclick=()=>window.print();
  }

  async function alerts(){
    const [open,stock,reqs,hreqs,deliveries]=await Promise.all([
      sb.from('alerts').select('*').eq('institution_id',state.institution.id).eq('resolved',false).order('created_at',{ascending:false}).range(0,99),
      sb.from('v_inventory_status').select('material_id,current_quantity,minimum_quantity,ideal_quantity,stock_status,materials(name,code)').eq('academic_year_id',await getYearId()).limit(500),
      sb.from('v_requisition_reporting_fast').select('id,number,request_date,status,teacher_id,area_id,section_id,material_name_snapshot,quantity_requested,quantity_delivered,quantity_pending').eq('academic_year_id',await getYearId()).order('request_date',{ascending:false}).limit(2000),
      sb.from('historical_requisitions').select('id,requisition_number_original,request_date_original,recipient_original,grade_section_original,area_original,observations_original,source_document_name').eq('institution_id',state.institution.id).order('created_at',{ascending:false}).limit(100),
      sb.from('requisition_deliveries').select('id,delivery_date,requisition_id,requisitions(number,status,request_date,teachers(full_name))').order('delivery_date',{ascending:false}).limit(200)
    ]);if(open.error||stock.error||reqs.error||hreqs.error||deliveries.error)throw open.error||stock.error||reqs.error||hreqs.error||deliveries.error;
    const critical=(stock.data||[]).filter(x=>Number(x.current_quantity)<=Number(x.minimum_quantity));
    const risk=(stock.data||[]).filter(x=>Number(x.current_quantity)>Number(x.minimum_quantity)&&Number(x.current_quantity)<Number(x.ideal_quantity));
    const pendingReqs=(reqs.data||[]).filter(x=>Number(x.quantity_pending)>0||['enviado','aprobado','en_atencion','parcial'].includes(String(x.status||'').toLowerCase()));
    const historical=(hreqs.data||[]);
    const cards=[];
    critical.forEach(x=>cards.push(`<div class="alert-item critical"><div class="top"><strong>Stock crítico · ${esc(x.materials?.name||'Material')}</strong><span class="badge danger">CRÍTICO</span></div><p>Saldo actual: <b>${num(x.current_quantity)}</b> · mínimo: ${num(x.minimum_quantity)}.</p><small>Origen: inventario ${state.year}.</small></div>`));
    risk.forEach(x=>cards.push(`<div class="alert-item warning"><div class="top"><strong>Stock en riesgo · ${esc(x.materials?.name||'Material')}</strong><span class="badge warn">RIESGO</span></div><p>Saldo actual: <b>${num(x.current_quantity)}</b> · ideal: ${num(x.ideal_quantity)}.</p></div>`));
    pendingReqs.slice(0,50).forEach(x=>cards.push(`<div class="alert-item warning"><div class="top"><strong>Requerimiento pendiente · RQ-${state.year}-${String(x.number).padStart(4,'0')}</strong><span class="badge warn">PENDIENTE</span></div><p>${esc(x.material_name_snapshot||'Material')} · solicitado ${num(x.quantity_requested)} · entregado ${num(x.quantity_delivered)} · pendiente <b>${num(x.quantity_pending)}</b>.</p></div>`));
    if(historical.length)cards.push(`<div class="alert-item info"><div class="top"><strong>Histórico PDF disponible</strong><span class="badge gray">${historical.length}</span></div><p>El sistema conserva ${historical.length} requerimientos históricos del PDF para consulta. Son datos históricos y no descuentan el stock actual por sí solos.</p></div>`);
    if(deliveries.data?.length)cards.push(`<div class="alert-item info"><div class="top"><strong>Entregas registradas</strong><span class="badge gray">${deliveries.data.length}</span></div><p>Hay entregas registradas en el módulo actual. Las salidas vinculadas deben reflejarse en Kardex.</p></div>`);
    (open.data||[]).forEach(a=>cards.push(`<div class="alert-item ${a.severity==='critical'?'critical':a.severity==='warning'?'warning':'info'}"><div class="top"><strong>${esc(a.title)}</strong><span>${badge(a.severity)}</span></div><p>${esc(a.message)}</p>${canWrite()?`<button class="btn ghost sm resolve-alert" data-alert="${a.id}">Marcar resuelta</button>`:''}</div>`));
    $('#content').innerHTML=pageHead('Alertas','Centro de control: stock, requerimientos, entregas, históricos y datos que requieren atención.',canWrite()?`<button class="btn secondary" id="genAlerts">Actualizar alertas</button>`:'')+
      `<div class="kpis">${kpi('Críticas',critical.length,'danger','Stock en o bajo mínimo')}${kpi('En riesgo',risk.length,'warn','Stock por debajo del ideal')}${kpi('Pendientes',pendingReqs.length,'warn','Líneas de requerimientos')}${kpi('Histórico PDF',historical.length,'','Requerimientos conservados')}</div>`+
      `<div class="alert-list">${cards.join('')||'<div class="empty">No hay alertas abiertas ni situaciones que requieran atención con los datos actuales.</div>'}</div>`;
    if(canWrite()){$('#genAlerts').onclick=async()=>{try{const z=await sb.rpc('generate_system_alerts');if(z.error)throw z.error;toast(`${z.data||0} alerta(s) del sistema actualizadas`);alerts()}catch(e){err(e)}};$$('.resolve-alert').forEach(b=>b.onclick=async()=>{try{const z=await sb.from('alerts').update({resolved:true,resolved_by:state.user.id,resolved_at:new Date().toISOString()}).eq('id',b.dataset.alert);if(z.error)throw z.error;toast('Alerta resuelta');alerts()}catch(e){err(e)}})}
  }

  async function settings(){
    const [meta,iy,wh,mat,ar,cat,unit]=await Promise.all([
      sb.rpc('cdo_backup_schema_metadata'),getYearId(),
      sb.from('warehouses').select('id,name,warehouse_year,active,is_historical').eq('institution_id',state.institution.id).order('warehouse_year',{ascending:false}),
      sb.from('materials').select('id,active',{count:'exact',head:true}).eq('institution_id',state.institution.id),
      sb.from('areas').select('id,active',{count:'exact',head:true}).eq('institution_id',state.institution.id),
      sb.from('material_categories').select('id,active',{count:'exact',head:true}).eq('institution_id',state.institution.id),
      sb.from('measurement_units').select('id,active',{count:'exact',head:true}).eq('institution_id',state.institution.id)
    ]);
    if(wh.error||mat.error||ar.error||cat.error||unit.error)throw wh.error||mat.error||ar.error||cat.error||unit.error;
    $('#content').innerHTML=pageHead('Configuración','Centro de control administrativo para operar y revisar el sistema.',isAdmin()?`<button class="btn secondary" id="refreshSettings">Actualizar</button>`:'')+
      `<div class="grid-3">
        <div class="panel"><h3>🏫 Institución</h3><p><b>${esc(state.institution?.name||C.institutionName)}</b></p><small>Año activo: ${state.year}</small></div>
        <div class="panel"><h3>📚 Catálogos</h3><p>${num(mat.count)} materiales · ${num(ar.count)} áreas</p><small>${num(cat.count)} categorías · ${num(unit.count)} unidades</small></div>
        <div class="panel"><h3>📦 Almacenes</h3><p>${num((wh.data||[]).length)} registrados</p><small>${(wh.data||[]).filter(x=>x.active).length} activos · ${((wh.data||[]).filter(x=>x.is_historical)).length} históricos</small></div>
      </div>
      <div class="grid-3" style="margin-top:14px">
        <div class="panel action-panel"><h3>📅 Año académico</h3><p>Trabajando actualmente con <b>${state.year}</b>.</p><button class="btn secondary" data-go="years">Gestionar años</button></div>
        <div class="panel action-panel"><h3>👥 Personas y aulas</h3><p>Administra alumnos, matrículas, docentes y asignaciones.</p><button class="btn secondary" data-go="students">Ir a alumnos</button></div>
        <div class="panel action-panel"><h3>🧰 Catálogos</h3><p>Actualiza materiales, áreas, categorías y unidades.</p><button class="btn secondary" data-go="materials">Ir a materiales</button></div>
        <div class="panel action-panel"><h3>📦 Inventario</h3><p>Consulta existencias y registra movimientos con validación.</p><button class="btn secondary" data-go="inventory">Ir a inventario</button></div>
        <div class="panel action-panel"><h3>📑 Requerimientos</h3><p>Consulta solicitudes, entregas y pendientes del año.</p><button class="btn secondary" data-go="requisitions">Ir a requerimientos</button></div>
        <div class="panel action-panel"><h3>🚨 Control</h3><p>Revisa alertas, stock crítico y pendientes.</p><button class="btn secondary" data-go="alerts">Ver alertas</button></div>
      </div>
      <div class="panel" style="margin-top:14px"><h3>🛠 Herramientas del administrador</h3><div class="toolbar settings-tools"><button class="btn secondary" data-go="kardex">Consultar Kardex</button><button class="btn secondary" data-go="reports">Generar reportes</button><button class="btn secondary" data-go="backups">Respaldos</button></div></div>
      <div class="panel" style="margin-top:14px"><h3>Información técnica</h3><p>Proyecto Supabase: <span class="mono">szfxdwngxahnigplyqdh</span></p><small>${meta.error?'Metadatos no disponibles':`Tablas públicas documentadas: ${(meta.data?.tables||[]).length}`}. El sistema funciona en línea y no usa IndexedDB ni sincronización offline.</small></div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>{state.view=b.dataset.go;state.page=0;render()});$('#refreshSettings')?.addEventListener('click',settings);
  }

  async function users(){if(!isAdmin()){$('#content').innerHTML='<div class="notice">Solo el administrador puede consultar usuarios y permisos.</div>';return}const r=await sb.from('user_profiles').select('id,full_name,role,active,created_at').eq('institution_id',state.institution.id).order('full_name');if(r.error)throw r.error;$('#content').innerHTML=pageHead('Usuarios y permisos','El rol efectivo se valida en RLS y funciones PostgreSQL.',`<button class="btn secondary" id="refreshU">Actualizar</button>`)+table(r.data,['Usuario','Rol','Estado','Creado'],(r.data||[]).map(u=>`<tr><td>${esc(u.full_name||u.id)}</td><td><b>${esc(roleLabel[u.role]||u.role)}</b></td><td>${u.active?'<span class="badge ok">ACTIVO</span>':'<span class="badge gray">INACTIVO</span>'}</td><td>${new Date(u.created_at).toLocaleDateString('es-PE')}</td></tr>`).join(''));$('#refreshU').onclick=users}
  async function backups(){if(!isAdmin()){$('#content').innerHTML='<div class="notice">Solo el administrador puede gestionar respaldos.</div>';return}const r=await sb.from('backups').select('*').order('created_at',{ascending:false});if(r.error)throw r.error;$('#content').innerHTML=pageHead('Respaldos','El respaldo lógico disponible cubre las tablas del sistema nuevo. Auth y Storage no se incluyen en ese JSON.',`<button class="btn primary" id="makeB">+ Crear respaldo</button>`)+`<div class="warning">El respaldo lógico no sustituye un dump físico de PostgreSQL ni un backup de Auth/Storage. No se presentará como “backup completo”.</div>`+table(r.data,['Fecha','Tipo','Estado','Checksum','Registros'],(r.data||[]).map(b=>`<tr><td>${new Date(b.created_at).toLocaleString('es-PE')}</td><td>${esc(b.backup_type)}</td><td>${badge(b.status)}</td><td class="mono">${esc(b.checksum||'—')}</td><td>${esc(JSON.stringify(b.record_counts||{}))}</td></tr>`).join(''));$('#makeB').onclick=async()=>{try{const z=await sb.rpc('create_system_backup_snapshot');if(z.error)throw z.error;const blob=new Blob([JSON.stringify(z.data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`CDO_backup_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();URL.revokeObjectURL(a.href);toast('Respaldo lógico creado y descargado');backups()}catch(e){err(e)}}}
  async function settings(){const meta=await sb.rpc('cdo_backup_schema_metadata');$('#content').innerHTML=pageHead('Configuración','Información técnica del sistema y del proyecto.')+`<div class="grid-3"><div class="panel"><h3>Institución</h3><p>${esc(state.institution?.name||'—')}</p><small>Proyecto Supabase: szfxdwngxahnigplyqdh</small></div><div class="panel"><h3>Arquitectura</h3><p>Online · PWA responsive · consultas paginadas</p><small>Sin IndexedDB ni sincronización offline.</small></div><div class="panel"><h3>Seguridad</h3><p>Auth + RLS + funciones PostgreSQL</p><small>Las operaciones críticas no dependen del frontend.</small></div></div><div class="panel" style="margin-top:14px"><h3>Metadatos de esquema</h3><p style="font-size:11px;color:var(--muted)">${meta.error?'No disponible':`Tablas públicas documentadas: ${(meta.data?.tables||[]).length}`}</p></div>`}
  const views={dashboard,years,students,enrollments,teachers,assignments,areas:()=>simpleCatalog('areas','Áreas',[{key:'name',label:'Área'}],[{key:'name',label:'Nombre',placeholder:'Ej. Secretaría, Tópico, Coordinación...'}]),categories:()=>simpleCatalog('material_categories','Categorías',[{key:'name',label:'Categoría'}],[{key:'name',label:'Nombre'}]),units:()=>simpleCatalog('measurement_units','Unidades',[{key:'name',label:'Unidad'},{key:'abbreviation',label:'Abreviatura'}],[{key:'name',label:'Nombre'},{key:'abbreviation',label:'Abreviatura'}]),materials,warehouses,inventory,kardex,requisitions,deliveries,acts,supplies,reports,alerts,users,backups,settings};
  sb.auth.onAuthStateChange(()=>{});init();
})()
  function printPreviewElement(id){const el=document.getElementById(id);if(!el)return;document.body.classList.add('printing-preview');document.querySelectorAll('.report-paper').forEach(x=>x.classList.toggle('print-target',x===el));setTimeout(()=>{window.print();document.body.classList.remove('printing-preview');document.querySelectorAll('.report-paper').forEach(x=>x.classList.remove('print-target'));},30)};