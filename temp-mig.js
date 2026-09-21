const {Pool} = require('pg');
const pool = new Pool({connectionString: 'postgresql://zaya_cloud_admin:7NAp5sMPonph5bE9-i_SfA9343UAcY@69.62.93.76:5432/zaya_cloud'});

async function run() {
  try {
    console.log("Iniciando ALTER TABLE...");
    await pool.query(`
      ALTER TABLE core.pedidos_licenca ADD COLUMN IF NOT EXISTS lote_id uuid;
      ALTER TABLE core.pedidos_licenca ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES core.filiais(id);
      CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_lote ON core.pedidos_licenca(lote_id);
    `);
    console.log("ALTER TABLE concluído.");
  } catch (err) {
    console.error("Erro na migration:", err);
  } finally {
    process.exit(0);
  }
}
run();
