
exports.up = async function(knex) {
  return knex.schema.createTable('epics', function (table) {
    table.increments();
    table.integer('project_id').unsigned();
    table.text('jira_key').notNullable();
    table.json('commits').notNullable();
    table.timestamp('started_at');
    table.timestamps(true, true);

    table.foreign('project_id').references('projects.id').onDelete('cascade');
    table.unique('jira_key');
  });
};

exports.down = async function(knex) {
  return knex.schema.dropTableIfExists("epics");
};
