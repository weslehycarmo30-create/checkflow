"use client";

import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient, supabaseConfiguration } from "../../lib/supabase";

type Mode = "login" | "signup" | "forgot" | "reset";

export default function AuthPage() {
  const [mode,setMode]=useState<Mode>(()=>typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("mode")==="reset"?"reset":"login");
  const [name,setName]=useState(""); const [organization,setOrganization]=useState("");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const client=getSupabaseBrowserClient(); if(!client) return;
    const isReset=new URLSearchParams(window.location.search).get("mode")==="reset";
    client.auth.getSession().then(({data})=>{if(data.session&&!isReset) window.location.replace("/")});
    const {data}=client.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY") setMode("reset")});
    return ()=>data.subscription.unsubscribe();
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault(); setMessage("");
    const client=getSupabaseBrowserClient();
    if(!client){setMessage(`Configuração ausente: ${supabaseConfiguration.missing.join(", ")}.`);return}
    setBusy(true);
    try{
      if(mode==="login"){
        const {error}=await client.auth.signInWithPassword({email,password}); if(error) throw error;
        window.location.replace("/");
      } else if(mode==="signup"){
        const redirectTo=`${window.location.origin}/auth`;
        const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:redirectTo,data:{full_name:name,organization_name:organization}}}); if(error) throw error;
        setMessage(data.session?"Conta criada. Redirecionando...":"Cadastro recebido. Confirme o e-mail para entrar.");
        if(data.session) window.location.replace("/");
      } else if(mode==="forgot"){
        const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/auth?mode=reset`}); if(error) throw error;
        setMessage("Enviamos o link de recuperação para o seu e-mail.");
      } else {
        const {error}=await client.auth.updateUser({password}); if(error) throw error;
        setMessage("Senha atualizada. Você já pode acessar o CheckFlow."); setMode("login"); setPassword("");
      }
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível concluir a operação.")}finally{setBusy(false)}
  }

  return <main className="auth-page"><section className="auth-card"><div className="auth-brand"><span className="brandmark">✓</span><strong>CheckFlow</strong></div><p className="eyebrow">GESTÃO OPERACIONAL</p><h1>{mode==="login"?"Entrar":mode==="signup"?"Criar sua empresa":mode==="forgot"?"Recuperar senha":"Definir nova senha"}</h1><p className="subtitle">{mode==="signup"?"O primeiro usuário será o proprietário da organização.":"Acesse sua operação com segurança."}</p><form onSubmit={submit}>{mode==="signup"&&<><label>Seu nome<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label><label>Nome da empresa<input required value={organization} onChange={e=>setOrganization(e.target.value)}/></label></>}{mode!=="reset"&&<label>E-mail<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></label>}{mode!=="forgot"&&<label>Senha<input required minLength={8} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==="login"?"current-password":"new-password"}/></label>}<button className="primary" disabled={busy}>{busy?"Aguarde...":mode==="login"?"Entrar":mode==="signup"?"Criar conta":mode==="forgot"?"Enviar link":"Salvar nova senha"}</button></form>{message&&<p className="auth-message" role="status">{message}</p>}<div className="auth-links">{mode!=="login"&&<button onClick={()=>{setMode("login");setMessage("")}}>Voltar ao login</button>}{mode==="login"&&<><button onClick={()=>setMode("signup")}>Criar empresa</button><button onClick={()=>setMode("forgot")}>Esqueci a senha</button></>}</div></section></main>
}
