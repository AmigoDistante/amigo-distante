require("dotenv").config();

const express = require("express");
const session = require("express-session");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "amigo-distante.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  rg TEXT,
  mother_name TEXT,
  father_name TEXT,
  cnh TEXT,
  birth_certificate TEXT,
  cep TEXT,
  city TEXT,
  state TEXT,
  neighborhood TEXT,
  street TEXT,
  complement TEXT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  interest_percent REAL NOT NULL DEFAULT 30,
  total_cents INTEGER NOT NULL,
  request_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  declaration_video TEXT,
  rg_photo TEXT,
  status TEXT NOT NULL DEFAULT 'Pendente',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const defaults = {
  siteName: "Amigo Distante",
  primary: "#718096",
  background: "#f6f7f9",
  surface: "#ffffff",
  text: "#263238",
  font: "Inter",
  heroImage: ""
};
for (const [key, value] of Object.entries(defaults)) {
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(key, value);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2,10)}-${safe}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [
      "image/jpeg","image/png","image/webp",
      "video/mp4","video/webm","video/quicktime",
      "application/pdf"
    ].includes(file.mimetype);
    cb(ok ? null : new Error("Tipo de arquivo não permitido."), ok);
  }
});

app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "CHANGE_ME_IN_PRODUCTION",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure:false, maxAge: 1000*60*60*8 }
}));

function getSettings() {
  return Object.fromEntries(db.prepare("SELECT key,value FROM settings").all().map(x => [x.key,x.value]));
}
function adminOnly(req,res,next) {
  if (!req.session.admin) return res.status(401).json({error:"Não autorizado."});
  next();
}
function userOnly(req,res,next) {
  if (!req.session.userId) return res.status(401).json({error:"Faça login."});
  next();
}
function cleanCpf(v="") { return String(v).replace(/\D/g,""); }
function cents(n) { return Math.round(Number(n)*100); }

app.use(express.static(path.join(ROOT,"public")));

app.get("/api/settings", (_req,res)=>res.json(getSettings()));

app.post("/api/register", (req,res)=>{
  try {
    const b=req.body;
    const cpf=cleanCpf(b.cpf);
    if (!b.fullName || cpf.length !== 11) return res.status(400).json({error:"Nome completo e CPF válido são obrigatórios."});
    if (!b.username) return res.status(400).json({error:"Nome de usuário é obrigatório."});
    const password=String(b.password||"");
    if (password.length < 7 || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password))
      return res.status(400).json({error:"A senha deve ter ao menos 7 caracteres e um caractere especial."});
    const exists=db.prepare("SELECT id FROM users WHERE cpf=? OR username=?").get(cpf,b.username);
    if(exists) return res.status(409).json({error:"CPF ou nome de usuário já cadastrado."});
    const hash=bcrypt.hashSync(password,12);
    const info=db.prepare(`
      INSERT INTO users(full_name,cpf,rg,mother_name,father_name,cnh,birth_certificate,cep,city,state,neighborhood,street,complement,username,password_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(b.fullName,cpf,b.rg||"",b.motherName||"",b.fatherName||"",b.cnh||"",b.birthCertificate||"",b.cep||"",b.city||"",b.state||"",b.neighborhood||"",b.street||"",b.complement||"",b.username,hash);
    req.session.userId=info.lastInsertRowid;
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:"Não foi possível concluir o cadastro."}); }
});

app.post("/api/login", (req,res)=>{
  const user=db.prepare("SELECT * FROM users WHERE username=?").get(req.body.username);
  if(!user || !bcrypt.compareSync(String(req.body.password||""),user.password_hash))
    return res.status(401).json({error:"Usuário ou senha inválidos."});
  req.session.userId=user.id;
  req.session.admin=false;
  res.json({ok:true});
});

app.post("/api/admin/login",(req,res)=>{
  const u=String(req.body.username||"");
  const p=String(req.body.password||"");
  if(u === (process.env.ADMIN_USER||"admin") && p === (process.env.ADMIN_PASSWORD||"CHANGE_ME"))
  {
    req.session.admin=true; req.session.userId=null;
    return res.json({ok:true});
  }
  res.status(401).json({error:"Credenciais administrativas inválidas."});
});

app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.post("/api/loan", userOnly, upload.fields([
  {name:"rgPhoto",maxCount:1},{name:"declarationVideo",maxCount:1}
]), (req,res)=>{
  try {
    const amount=cents(req.body.amount);
    const interest=30;
    if(!amount || amount<1) return res.status(400).json({error:"Informe um valor válido."});
    const requestDate=req.body.requestDate;
    const dueDate=req.body.dueDate;
    if(!requestDate || !dueDate) return res.status(400).json({error:"Informe as datas."});
    const total=Math.round(amount*(1+interest/100));
    const rgPhoto=req.files?.rgPhoto?.[0]?.filename || "";
    const video=req.files?.declarationVideo?.[0]?.filename || "";
    const info=db.prepare(`
      INSERT INTO loans(user_id,amount_cents,interest_percent,total_cents,request_date,due_date,declaration_video,rg_photo)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(req.session.userId,amount,interest,total,requestDate,dueDate,video,rgPhoto);
    res.json({ok:true,id:info.lastInsertRowid,total:total/100});
  } catch(e) { res.status(500).json({error:"Erro ao registrar a solicitação."}); }
});

app.get("/api/me", userOnly,(req,res)=>{
  const u=db.prepare("SELECT id,full_name,cpf,rg,mother_name,father_name,cnh,birth_certificate,cep,city,state,neighborhood,street,complement,username,created_at FROM users WHERE id=?").get(req.session.userId);
  const loans=db.prepare("SELECT id,amount_cents,interest_percent,total_cents,request_date,due_date,status,created_at FROM loans WHERE user_id=? ORDER BY id DESC").all(req.session.userId);
  res.json({user:u,loans});
});

app.get("/api/admin/users",adminOnly,(_req,res)=>{
  const rows=db.prepare(`
    SELECT u.*, COUNT(l.id) loan_count,
      COALESCE(SUM(l.amount_cents),0) total_requested
    FROM users u LEFT JOIN loans l ON l.user_id=u.id
    GROUP BY u.id ORDER BY u.id DESC
  `).all();
  rows.forEach(r=>delete r.password_hash);
  res.json(rows);
});

app.get("/api/admin/loans",adminOnly,(_req,res)=>{
  const rows=db.prepare(`
    SELECT l.*,u.full_name,u.cpf,u.rg,u.mother_name,u.father_name,u.cnh,u.birth_certificate,
           u.cep,u.city,u.state,u.neighborhood,u.street,u.complement,u.username
    FROM loans l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC
  `).all();
  res.json(rows);
});

app.get("/api/admin/file/:loanId/:type",adminOnly,(req,res)=>{
  const l=db.prepare("SELECT rg_photo,declaration_video FROM loans WHERE id=?").get(req.params.loanId);
  if(!l) return res.status(404).send("Não encontrado");
  const filename=req.params.type==="video"?l.declaration_video:l.rg_photo;
  if(!filename) return res.status(404).send("Arquivo não encontrado");
  const file=path.join(UPLOAD_DIR,path.basename(filename));
  if(!fs.existsSync(file)) return res.status(404).send("Arquivo não encontrado");
  res.sendFile(file);
});

app.patch("/api/admin/settings",adminOnly,(req,res)=>{
  const allowed=["siteName","primary","background","surface","text","font","heroImage"];
  const tx=db.transaction(obj=>{
    for(const k of allowed) if(typeof obj[k]==="string")
      db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,obj[k]);
  });
  tx(req.body); res.json({ok:true,settings:getSettings()});
});

app.patch("/api/admin/loan/:id",adminOnly,(req,res)=>{
  const allowed=["status"];
  if(!allowed.includes("status")) return res.status(400).json({error:"Campo inválido."});
  const statuses=["Pendente","Em análise","Aprovado","Recusado","Pago","Encerrado"];
  if(!statuses.includes(req.body.status)) return res.status(400).json({error:"Status inválido."});
  db.prepare("UPDATE loans SET status=? WHERE id=?").run(req.body.status,req.params.id);
  res.json({ok:true});
});

app.post("/api/admin/reset-user-password/:id",adminOnly,(req,res)=>{
  const p=String(req.body.password||"");
  if(p.length<7 || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p))
    return res.status(400).json({error:"Senha deve ter ao menos 7 caracteres e caractere especial."});
  db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(bcrypt.hashSync(p,12),req.params.id);
  res.json({ok:true});
});

app.use((err,_req,res,_next)=>{
  if(err instanceof multer.MulterError) return res.status(400).json({error:"Upload inválido ou arquivo grande demais."});
  res.status(500).json({error:err.message||"Erro interno."});
});

app.listen(PORT,()=>console.log(`Amigo Distante: http://localhost:${PORT}`));
