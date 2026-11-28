"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { buildQualifiedSalesWhatsAppUrl, getSalesWhatsAppUrl } from "../lib/sales-contact";

type Qualification = { name: string; company: string; operation: string; process: string };
const emptyQualification: Qualification = { name: "", company: "", operation: "", process: "" };
const salesNumber = process.env.NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP;
const salesAvailable = Boolean(getSalesWhatsAppUrl(salesNumber));

type PilotCtaProps = { className?: string; label?: string };

// Opens a short qualification form and hands off to WhatsApp. Nothing is sent
// to our servers: the answers only prefill the WhatsApp message. Without a
// configured sales number, the CTA falls back to self-service signup.
export function PilotCta({ className = "cf-button", label = "Começar meu piloto" }: PilotCtaProps) {
  const [open, setOpen] = useState(false);
  const [qualification, setQualification] = useState(emptyQualification);
  const [formError, setFormError] = useState("");
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const close = () => { setOpen(false); setFormError(""); };

  useEffect(() => {
    if (!open) return;
    const opener = openerRef.current;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      opener?.focus();
    };
  }, [open]);

  if (!salesAvailable) {
    return <a className={className} href="/auth">Criar conta da empresa <span aria-hidden="true">↗&#xFE0E;</span></a>;
  }

  const setField = (field: keyof Qualification) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setQualification(current => ({ ...current, [field]: event.target.value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.values(qualification).some(value => !value.trim())) { setFormError("Preencha os quatro campos para continuar."); return; }
    const url = buildQualifiedSalesWhatsAppUrl(salesNumber, qualification);
    if (!url) { setFormError("O canal comercial ainda não está configurado neste ambiente."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return <>
    <button ref={openerRef} className={className} type="button" onClick={() => setOpen(true)}>{label} <span aria-hidden="true">↗&#xFE0E;</span></button>
    {open && <div className="cf-dialog-backdrop" onMouseDown={close}>
      <div className="cf-dialog" role="dialog" aria-modal="true" aria-labelledby="cf-qualification-title" ref={dialogRef} onMouseDown={event => event.stopPropagation()}>
        <button className="cf-dialog-close" type="button" onClick={close} aria-label="Fechar">×</button>
        <p className="cf-label">PILOTO DE 14 DIAS</p>
        <h2 id="cf-qualification-title">Conte um pouco da sua operação.</h2>
        <p>Usamos estas respostas só para preparar sua mensagem no WhatsApp. Não inclua dados sensíveis.</p>
        <form onSubmit={submit} noValidate>
          <label>Nome<input value={qualification.name} onChange={setField("name")} maxLength={60} autoComplete="name" /></label>
          <label>Empresa<input value={qualification.company} onChange={setField("company")} maxLength={80} autoComplete="organization" /></label>
          <label>Tipo de operação<select value={qualification.operation} onChange={setField("operation")}><option value="">Selecione</option><option>Restaurante</option><option>Bar</option><option>Buffet</option><option>Eventos</option><option>Outra operação</option></select></label>
          <label>Primeiro processo a controlar<textarea value={qualification.process} onChange={setField("process")} maxLength={180} rows={3} aria-describedby="cf-process-limit" /></label>
          <small id="cf-process-limit">{qualification.process.length}/180 caracteres</small>
          {formError && <p className="cf-form-error" role="alert">{formError}</p>}
          <button className="cf-button" type="submit">Continuar para o WhatsApp <span aria-hidden="true">↗&#xFE0E;</span></button>
          <button className="cf-dialog-cancel" type="button" onClick={close}>Continuar explorando</button>
        </form>
      </div>
    </div>}
  </>;
}
