const {Pool} = require('pg');
const pool = new Pool({connectionString: 'postgresql://zaya_cloud_admin:7NAp5sMPonph5bE9-i_SfA9343UAcY@69.62.93.76:5432/zaya_cloud'});

async function run() {
  const r1 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'filiais'`);
  console.log('FILIAIS:', r1.rows);
  const r2 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'licencas_atribuidas'`);
  console.log('LICENCAS_ATRIBUIDAS:', r2.rows);
  const r3 = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'core' AND table_name = 'pedidos_licenca'`);
  console.log('PEDIDOS_LICENCA:', r3.rows);
  process.exit(0);
}
run();
