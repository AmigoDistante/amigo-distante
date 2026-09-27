# Amigo Distante — Portal de Empréstimos

Projeto full-stack em Node.js/Express + SQLite para cadastro de solicitantes, envio de documentos/vídeo, área do usuário e painel administrativo.

## Antes de colocar em produção

Este projeto lida com CPF, RG, CNH, certidão, endereço, documentos de identidade e vídeo. Esses dados são altamente sensíveis do ponto de vista de segurança e privacidade.

1. Instale Node.js 20+.
2. Copie `.env.example` para `.env`.
3. Defina `SESSION_SECRET` e uma senha forte em `ADMIN_PASSWORD`.
4. Rode `npm install`.
5. Rode `npm start`.
6. Acesse `http://localhost:3000`.

## Segurança

- Senhas dos usuários são armazenadas somente como hash.
- O administrador NÃO consegue visualizar a senha original do usuário; pode apenas redefini-la.
- O formulário aceita uma senha inicial baseada nos 6 primeiros dígitos do CPF + caractere especial, conforme o requisito solicitado, mas recomenda-se trocar isso por uma senha aleatória/temporária em produção.
- Uploads ficam fora da pasta pública.
- O painel exige sessão de administrador.
- Para produção, use HTTPS, armazenamento privado de arquivos, backups criptografados, política de retenção e controles de acesso.

## Importante sobre o serviço

Antes de usar comercialmente, revise com um advogado/contador as regras brasileiras aplicáveis a empréstimos, juros, proteção de dados (LGPD), contratos, consentimento e guarda de documentos. O site não constitui orientação jurídica.

## Estrutura

- `server.js` — backend e banco SQLite
- `public/` — interface
- `uploads/` — documentos enviados, protegidos pelo backend
- `data/` — banco SQLite criado automaticamente
