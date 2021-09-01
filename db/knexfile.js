module.exports = {
    production: {
        client: 'postgresql',
        connection: {
            host: '<host>',
            database: '<database name>',
            user: '<username>',
            password: '<password>'
        },
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            tableName: 'knex_migrations',
            directory: 'db/migrations'
        },
        seeds: {
            directory: 'db/seeds'
        }
    }
}
