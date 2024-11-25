use anyhow::Result;
use clap::Parser;
use log::info;
mod db;
mod r#type;
mod default;
mod webclient;
mod setup;

#[derive(clap::Parser)]
#[command(name = "sadmin_server")]
#[command(version = include_str!("../../version.txt"))]
#[command(author = "Jakob Truelsen <jakob@scalgo.com>")]
#[command(about = "Simpleadmin host components", long_about = None)]
struct Args {
    /// Verbosity of messages to display
    #[clap(long, default_value = "info")]
    log_level: log::LevelFilter,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    let args = Args::parse();

    simple_logger::SimpleLogger::new()
        .with_level(args.log_level)
        .init()
        .unwrap();

    info!("STARTING SERVER");

    db::init()?;

    //     instances.setMsg(new Msg());
    //     instances.setDeployment(new Deployment());
    //     instances.setDb(new DB());
    //     instances.setModifiedFiles(new ModifiedFiles());

    //     try {
    //         await instances.db.init();
    //     } catch (err) {
    //         errorHandler("db")(err);
    //     }
    //     instances.setWebClients(new WebClients());
    //     instances.webClients.startServer();
    //     instances.setHostClients(new HostClients());
    //     instances.hostClients.start();

    //setup();

    tokio_tasks::TaskBuilder::new("webclient").main()
        .create(|rt| webclient::run(rt));

    tokio::spawn(async {
        tokio::signal::ctrl_c().await.unwrap();
        tokio_tasks::shutdown("ctrl+c".to_string());
    });

    tokio_tasks::run_tasks().await;

    info!("SHUT DOWN");
    Ok(())
}
