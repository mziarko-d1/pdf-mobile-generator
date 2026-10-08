(function(){
  const config=window.DOCTOR_ONE_ADMIN_CONFIG||{};
  const tokenKey='doctor-one-admin:github-token:v1';
  const listeners=[];
  let token=sessionStorage.getItem(tokenKey)||'';
  let user=null;
  let loginBusy=false;

  const bar=document.getElementById('adminBar');
  const loginButton=document.getElementById('adminLogin');
  const logoutButton=document.getElementById('adminLogout');
  const identity=document.getElementById('adminIdentity');
  const status=document.getElementById('adminAuthStatus');
  const deviceBox=document.getElementById('adminDeviceBox');
  const deviceCode=document.getElementById('adminDeviceCode');
  const deviceLink=document.getElementById('adminDeviceLink');

  if(!bar||!loginButton||!logoutButton||!identity||!status) return;

  function setStatus(message,type){
    status.className='admin-auth-status'+(type?' '+type:'');
    status.textContent=message||'';
  }
  function notify(){
    render();
    listeners.forEach(function(fn){try{fn(apiState());}catch(error){console.error(error);}});
  }
  function apiState(){
    return {isAdmin:!!user,user:user,configured:!!config.githubClientId};
  }
  function render(){
    const logged=!!user;
    bar.classList.toggle('is-admin',logged);
    loginButton.classList.toggle('hidden',logged);
    logoutButton.classList.toggle('hidden',!logged);
    identity.textContent=logged?'Admin: @'+user.login:'Tryb standardowy';
    if(logged){
      setStatus('Możesz publikować i edytować wspólne szablony Doctor.One.','ok');
    }else if(!config.githubClientId){
      setStatus('Logowanie administratora czeka na konfigurację GitHub App.','setup');
    }else if(!loginBusy){
      setStatus('Tylko administrator może zmieniać wspólną bibliotekę.','');
    }
  }
  function hideDeviceBox(){
    if(deviceBox) deviceBox.classList.add('hidden');
  }
  function showDeviceBox(data){
    if(!deviceBox) return;
    deviceBox.classList.remove('hidden');
    if(deviceCode) deviceCode.textContent=data.user_code||'';
    if(deviceLink){
      deviceLink.href=data.verification_uri||'https://github.com/login/device';
      deviceLink.textContent='Otwórz GitHub i potwierdź';
    }
  }
  function formBody(values){
    const body=new URLSearchParams();
    Object.keys(values).forEach(function(key){
      const value=values[key];
      if(value!==undefined&&value!==null&&value!=='') body.set(key,String(value));
    });
    return body;
  }
  async function githubApi(path,options){
    if(!token) throw new Error('Brak sesji administratora.');
    const response=await fetch('https://api.github.com'+path,Object.assign({},options||{},{
      headers:Object.assign({
        'Accept':'application/vnd.github+json',
        'Authorization':'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28'
      },(options&&options.headers)||{})
    }));
    if(!response.ok){
      let message='GitHub API: '+response.status;
      try{
        const payload=await response.json();
        if(payload&&payload.message) message=payload.message;
      }catch{}
      const error=new Error(message);
      error.status=response.status;
      throw error;
    }
    if(response.status===204) return null;
    return await response.json();
  }
  async function verifyToken(){
    if(!token) return false;
    try{
      const profile=await githubApi('/user');
      if(!profile||profile.login!==config.allowedLogin){
        token='';
        user=null;
        sessionStorage.removeItem(tokenKey);
        setStatus('To konto nie ma uprawnień administratora tej biblioteki.','err');
        return false;
      }
      const repoInfo=await githubApi('/repos/'+config.repository);
      const canWrite=!!(repoInfo&&repoInfo.permissions&&(repoInfo.permissions.push||repoInfo.permissions.admin||repoInfo.permissions.maintain));
      if(!canWrite){
        token='';
        user=null;
        sessionStorage.removeItem(tokenKey);
        setStatus('Konto GitHub nie ma prawa zapisu do repozytorium generatora.','err');
        return false;
      }
      user=profile;
      notify();
      return true;
    }catch(error){
      console.error(error);
      token='';
      user=null;
      sessionStorage.removeItem(tokenKey);
      setStatus('Sesja administratora wygasła albo nie ma dostępu do repozytorium.','err');
      notify();
      return false;
    }
  }
  function sleep(ms){
    return new Promise(function(resolve){setTimeout(resolve,ms);});
  }
  async function startDeviceFlow(){
    if(loginBusy) return;
    if(!config.githubClientId){
      setStatus('Najpierw trzeba podpiąć Client ID GitHub App.','err');
      return;
    }
    loginBusy=true;
    loginButton.disabled=true;
    setStatus('Łączę z GitHub…','');
    try{
      const deviceResponse=await fetch('https://github.com/login/device/code',{
        method:'POST',
        headers:{
          'Accept':'application/json',
          'Content-Type':'application/x-www-form-urlencoded'
        },
        body:formBody({client_id:config.githubClientId})
      });
      if(!deviceResponse.ok) throw new Error('Nie udało się rozpocząć logowania GitHub.');
      const device=await deviceResponse.json();
      if(device.error) throw new Error(device.error_description||device.error);

      showDeviceBox(device);
      setStatus('Potwierdź kod na GitHub. Po autoryzacji wrócisz tu automatycznie.','');
      if(device.verification_uri){
        window.open(device.verification_uri,'doctorOneGithubAuth','noopener,noreferrer');
      }

      let interval=Math.max(5,Number(device.interval)||5);
      const expiresAt=Date.now()+(Number(device.expires_in)||900)*1000;

      while(Date.now()<expiresAt){
        await sleep(interval*1000);
        const tokenResponse=await fetch('https://github.com/login/oauth/access_token',{
          method:'POST',
          headers:{
            'Accept':'application/json',
            'Content-Type':'application/x-www-form-urlencoded'
          },
          body:formBody({
            client_id:config.githubClientId,
            device_code:device.device_code,
            grant_type:'urn:ietf:params:oauth:grant-type:device_code',
            repository_id:config.repositoryId
          })
        });
        if(!tokenResponse.ok) throw new Error('GitHub nie zwrócił tokenu administratora.');
        const payload=await tokenResponse.json();

        if(payload.access_token){
          token=payload.access_token;
          sessionStorage.setItem(tokenKey,token);
          hideDeviceBox();
          const ok=await verifyToken();
          if(ok) return;
          throw new Error('To konto nie jest administratorem biblioteki.');
        }

        if(payload.error==='authorization_pending') continue;
        if(payload.error==='slow_down'){
          interval+=5;
          continue;
        }
        if(payload.error==='expired_token') throw new Error('Kod logowania wygasł. Spróbuj ponownie.');
        if(payload.error==='access_denied') throw new Error('Logowanie zostało anulowane.');
        throw new Error(payload.error_description||payload.error||'Nie udało się zalogować przez GitHub.');
      }
      throw new Error('Kod logowania wygasł. Spróbuj ponownie.');
    }catch(error){
      console.error(error);
      setStatus(error.message||'Nie udało się zalogować.','err');
      hideDeviceBox();
    }finally{
      loginBusy=false;
      loginButton.disabled=false;
      render();
    }
  }
  function logout(){
    token='';
    user=null;
    sessionStorage.removeItem(tokenKey);
    hideDeviceBox();
    setStatus('Wylogowano administratora.','');
    notify();
  }
  function subscribe(fn){
    if(typeof fn==='function') listeners.push(fn);
  }
  function getConfig(){
    return Object.assign({},config);
  }

  const api={
    isAdmin:function(){return !!user;},
    getUser:function(){return user;},
    login:startDeviceFlow,
    logout:logout,
    verify:verifyToken,
    api:githubApi,
    subscribe:subscribe,
    getConfig:getConfig
  };
  window.DoctorOneAdmin=api;

  loginButton.addEventListener('click',startDeviceFlow);
  logoutButton.addEventListener('click',logout);

  render();
  if(token) verifyToken();
})();