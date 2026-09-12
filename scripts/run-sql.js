// Roda um arquivo .sql contra o Postgres usando uma connection string com
// permissão de owner (ex.: usuário "postgres"), diferente da que a aplicação
// usa (que só tem DML, sem ALTER TABLE).
//
// Uso (na pasta sinc/):
//   MIGRATION_DATABASE_URL="postgresql://postgres:SENHA@69.62.93.76:5432/zaya_cloud" node scripts/run-sql.js migrations/2026-09-11-codigo-licenca.sql

const fs = require("fs");
const { Client } = require("pg");

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("Uso: node scripts/run-sql.js <caminho-do-arquivo.sql>");
    process.exit(1);
  }

  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    console.error("Defina a variável MIGRATION_DATABASE_URL com a connection string do usuário owner.");
    process.exit(1);
  }

  const sql = fs.readFileSync(arquivo, "utf8");

  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log(`OK: ${arquivo} executado com sucesso.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ERRO ao rodar a migração:");
  console.error(err.message);
  process.exit(1);
});
