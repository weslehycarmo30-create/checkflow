"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { initializeSupabaseBrowserClient } from "../../lib/supabase";

type Mode = "login" | "signup" | "forgot" | "reset";

function subscribeToLocation(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getResetSearchSnapshot() {
  return new URLSearchParams(window.location.search).get("mode") === "reset";
}

function getServerResetSearchSnapshot() {
  return false;
}

export default function AuthPage() {
  // useSyncExternalStore uses the server snapshot during hydration, keeping
  // the first client render identical to SSR before reading browser location.
  const resetRequestedInSearch=useSyncExternalStore(subscribeToLocation,getResetSearchSnapshot,getServerResetSearchSnapshot);
  const [mode,setMode]=useState<Mode>("login");
  const [ignoreResetSearch,setIgnoreResetSearch]=useState(false);
  const activeMode:Mode=resetRequestedInSearch&&!ignoreResetSearch?"reset":mode;
  const [name,setName]=useState(""); const [organization,setOrganization]=useState("");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let unsubscribe:(()=>void)|undefined;
    const isReset=getResetSearchSnapshot();
    initializeSupabaseBrowserClient().then((client)=>{if(!client)return;
    client.auth.getSession().then(({data})=>{if(data.session&&!isReset) window.location.replace("/dashboard")});
    const {data}=client.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY"){setIgnoreResetSearch(false);setMode("reset")}});
    unsubscribe=()=>data.subscription.unsubscribe();});
    return ()=>unsubscribe?.();
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault(); setMessage("");
    const client=await initializeSupabaseBrowserClient();
    if(!client){setMessage("Não foi possível carregar a configuração do Supabase.");return}
    setBusy(true);
    try{
      if(activeMode==="login"){
        const {error}=await client.auth.signInWithPassword({email,password}); if(error) throw error;
        window.location.replace("/dashboard");
      } else if(activeMode==="signup"){
        const redirectTo=`${window.location.origin}/auth`;
        const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{full_name:name,organization_name:organization}}}); if(error) throw error;
        setMessage(data.session?"Conta criada. Redirecionando...":"Cadastro recebido. Confirme o e-mail para entrar.");
        if(data.session) window.location.replace("/dashboard");
      } else if(activeMode==="forgot"){
        const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/auth?mode=reset`}); if(error) throw error;
        setMessage("Enviamos o link de recuperação para o seu e-mail.");
      } else {
        const {error}=await client.auth.updateUser({password}); if(error) throw error;
        setMessage("Senha atualizada. Você já pode acessar o CheckFlow."); setIgnoreResetSearch(true); setMode("login"); setPassword("");
      }
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível concluir a operação.")}finally{setBusy(false)}
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brandmark">✓</span><strong>CheckFlow</strong></div><p className="eyebrow">GESTÃO OPERACIONAL</p><h1>{activeMode==="login"?"Entrar":activeMode==="signup"?"Criar sua empresa":activeMode==="forgot"?"Recuperar senha":"Definir nova senha"}</h1><p className="subtitle">{activeMode==="signup"?"O primeiro usuário será o proprietário da organização.":"Acesse sua operação com segurança."}</p><form onSubmit={submit}>{activeMode==="signup"&&<><label>Seu nome<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label><label>Nome da empresa<input required value={organization} onChange={e=>setOrganization(e.target.value)}/></label></>}{activeMode!=="reset"&&<label>E-mail<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>}{activeMode!=="forgot"&&<label>Senha<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={activeMode==="login"?"current-password":"new-password"}/></label>}<button className="primary" disabled={busy}>{busy?"Aguarde...":activeMode==="login"?"Entrar":activeMode==="signup"?"Criar conta":activeMode==="forgot"?"Enviar link":"Salvar nova senha"}</button></form>{message&&<p className="auth-message" role="status">{message}</p>}<div className="auth-links">{activeMode!=="login"&&<button onClick={()=>{setIgnoreResetSearch(true);setMode("login");setMessage("")}}>Voltar ao login</button>}{activeMode==="login"&&<><button onClick={()=>setMode("signup")}>Criar empresa</button><button onClick={()=>setMode("forgot")}>Esqueci a senha</button></>}</div></section></main>
}
