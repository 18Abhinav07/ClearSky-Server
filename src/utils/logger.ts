import * as winston from "winston";
import * as path from "node:path";
import * as fs from "node:fs";
import Transport from "winston-transport"; // Import Transport
import axios from "axios"; // Import Axios
import Config from "../core/config/index";

// --- Customization for `notify` level ---
const customLogLevels = {
    levels: {
        error: 0,
        warn: 1,
        notify: 2,
        info: 3,
        http: 4,
        verbose: 5,
        debug: 6,
        silly: 7,
    },
    colors: {
        error: "red",
        warn: "yellow",
        notify: "blue",
        info: "green",
        http: "magenta",
        verbose: "cyan",
        debug: "white",
        silly: "grey",
    },
};

// Interface for our custom logger
interface PayzollLogger extends winston.Logger {
  notify: winston.LeveledLogMethod;
}

winston.addColors(customLogLevels.colors);
// --- End Customization ---

// Define log directories
const logsDir = path.join(process.cwd(), "logs");
const archiveDir = path.join(logsDir, "archive");

// ... [Existing archiveOldLogs logic remains unchanged] ...
// Archive old logs when server starts
function archiveOldLogs() {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const logFiles = ["error.log", "info.log", "combined.log"];
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  for (const logFile of logFiles) {
    const logPath = path.join(logsDir, logFile);
    if (fs.existsSync(logPath)) {
      try {
        const archivePath = path.join(archiveDir, `${timestamp}_${logFile}`);
        fs.copyFileSync(logPath, archivePath);
        fs.truncateSync(logPath, 0); 
        console.log(`Archived ${logFile} to ${archivePath}`);
      } catch (err) {
        console.error(`Failed to archive ${logFile}:`, err);
      }
    }
  }
}
archiveOldLogs();

// ... [Existing helper functions: convertJsToTsPath, getCallerInfo remain unchanged] ...
function convertJsToTsPath(jsPath: string): string {
  const projectRoot = process.cwd();
  if (jsPath.endsWith(".ts")) {return jsPath;}
  let tsPath = jsPath;
  if (jsPath.endsWith(".js")) {tsPath = jsPath.replace(/\.js$/, ".ts");}
  if (tsPath.includes("/dist/") || tsPath.includes("/build/")) {
    tsPath = tsPath.replace(/\/dist\//, "/src/").replace(/\/build\//, "/src/");
  }
  if (tsPath.startsWith(projectRoot) && !tsPath.includes("/src/") && !tsPath.includes("node_modules")) {
    const relativePath = path.relative(projectRoot, tsPath);
    tsPath = path.join(projectRoot, "src", relativePath);
  }
  return tsPath;
}

function getCallerInfo() {
  const originalStackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 20; 
  const error = {} as Error;
  Error.captureStackTrace(error, getCallerInfo);
  const stackLines = error.stack?.split("\n").slice(1) || [];
  Error.stackTraceLimit = originalStackTraceLimit;

  for (const line of stackLines) {
    const match = line.match(/\(([^:]+):(\d+):\d+\)/) || line.match(/at\s+([^:]+):(\d+):\d+/);
    if (match) {
      const [, file, lineNumber] = match;
      if (
        file.includes("node_modules/winston") ||
        file.includes("node_modules/logform") ||
        file.includes("node_modules/readable-stream") ||
        file.includes("node_modules/@types") ||
        file.includes("internal/") ||
        file.includes("node:") ||
        file.includes("/logger/logger") ||
        file.includes("_stream_transform.js")
      ) {
        continue;
      }
      const tsPath = convertJsToTsPath(file);
      return {
        file: tsPath,
        line: Number.parseInt(lineNumber, 10),
        function: line.match(/at\s+([^(]+)\s+\(/)
          ? line.match(/at\s+([^(]+)\s+\(/)?.[1]?.trim() || "anonymous"
          : "anonymous",
      };
    }
  }
  return { file: "unknown", line: 0, function: "anonymous" };
}

// ... [Existing Interface and Format] ...
interface UnifiedLogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: 'backend' | 'docker-container';
  logpath?: string;
  file?: string;
  line?: number;
  function?: string;
}

const fileAndLine = winston.format((info) => {
  const stackInfo = getCallerInfo();
  if (stackInfo && stackInfo.file !== "unknown") {
    const projectPath = stackInfo.file.replace(process.cwd(), "");
    const relativePath = projectPath.startsWith("/") ? projectPath.substring(1) : projectPath;
    info.logpath = `${relativePath}:${stackInfo.line}`;
    info.file = path.basename(stackInfo.file);
    info.line = stackInfo.line;
    info.filePath = stackInfo.file;
    info.function = stackInfo.function;
  } else {
    info.logpath = "unknown:0";
    info.file = "unknown";
    info.line = 0;
    info.filePath = "unknown";
    info.function = "anonymous";
  }
  info.source = 'backend';
  return info;
});

// ---------------------------------------------------------
// NEW: Custom Discord Transport
// ---------------------------------------------------------
interface DiscordTransportOptions extends winston.transport.TransportStreamOptions {
  webhookUrl: string;
}

class DiscordTransport extends Transport {
  private webhookUrl: string;

  constructor(opts: DiscordTransportOptions) {
    super(opts);
    this.webhookUrl = opts.webhookUrl;
  }

  log(info: any, callback: () => void) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    // Only send if we have a URL and the level is one we're interested in
    if (this.webhookUrl && (info.level === 'error' || info.level === 'notify')) {
      this.sendToDiscord(info);
    }

    callback();
  }

  private async sendToDiscord(info: any) {
    try {
      let color: number;
      let title: string;
      let footerText: string;

      switch (info.level) {
        case 'error':
          color = 15158332; // Red
          title = `🚨 ${info.level.toUpperCase()}: ${info.function || 'Unknown Context'}`;
          footerText = "System Alert";
          break;
        case 'notify':
          color = 3447003; // Blue
          title = `🔔 NOTIFICATION: ${info.function || 'General'}`;
          footerText = "System Notification";
          break;
        default:
          // Fallback for any other level that might get through
          color = 10070709; // Grey
          title = `📢 LOG: ${info.level.toUpperCase()}`;
          footerText = "System Log";
          break;
      }

      const payload = {
        username: "Backend Logger",
        embeds: [
          {
            title,
            description: `**Message:**\n\
\
${info.message}\
\
\
`,
            color,
            fields: [
              {
                name: "📍 Source",
                value: `\
${info.logpath}\
`,
                inline: true
              },
              {
                name: "🕒 Time",
                value: info.timestamp,
                inline: true
              }
            ],
            footer: {
              text: footerText
            }
          }
        ]
      };

      await axios.post(this.webhookUrl, payload);
    } catch (error) {
      // Prevent infinite loop if logging fails
      console.error("Failed to send log to Discord:", error);
    }
  }
}

// ---------------------------------------------------------
// Updated Logger Creation
// ---------------------------------------------------------

const transportsList: winston.transport[] = [
  new winston.transports.File({ filename: path.join(logsDir, "error.log"), level: "error" }),
  new winston.transports.File({ filename: path.join(logsDir, "info.log"), level: "info" }),
  new winston.transports.File({ filename: path.join(logsDir, "combined.log") }),
];

// Add Discord Transport if URL is configured AND enabled via env variable
if (Config.DISCORD_WEBHOOK_URL && Config.ENABLE_DISCORD_LOGGING) {
  transportsList.push(
    new DiscordTransport({
      webhookUrl: Config.DISCORD_WEBHOOK_URL,
    })
  );
  console.log('Discord logging enabled - errors and notifications will be sent to Discord webhook');
} else if (Config.DISCORD_WEBHOOK_URL && !Config.ENABLE_DISCORD_LOGGING) {
  console.log('Discord webhook configured but logging is disabled (set ENABLE_DISCORD_LOGGING=true to enable)');
}

export const logger = winston.createLogger({
  level: Config.LOG_LEVEL,
  levels: customLogLevels.levels,
  format: winston.format.combine(
    fileAndLine(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: transportsList,
}) as PayzollLogger;

// ... [Docker logger and other exports remain unchanged] ...
export const dockerLogger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, "docker-logs.log") }),
  ],
});

logger.add(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.align(),
      winston.format.colorize(),
      winston.format.printf((info) => {
        let timestamp = info.timestamp as string;
        timestamp = new Date(info.timestamp as string).getTime().toString();
        const sourceIndicator = info.source === 'docker-container' ? `[🐳 ${info.containerName}]` : `[${info.logpath}]`;
        return `${timestamp} ${sourceIndicator} ${info.level}: ${info.message}`;
      }),
    ),
  }),
);

// Export a function to log Docker container entries
export function logDockerEntry(entry: {
  level: string;
  message: string;
  containerName: string;
  containerId: string;
  containerImage: string;
  containerLabels?: Record<string, string>;
  timestamp?: string;
}) {
  const logEntry = {
    ...entry,
    source: 'docker-container' as const,
    timestamp: entry.timestamp || new Date().toISOString(),
  };

  // Log to docker-logs.log (Docker logs only)
  const level = entry.level.toLowerCase();
  if (level in dockerLogger.levels) {
    (dockerLogger as any)[level](logEntry.message, logEntry);
  } else {
    dockerLogger.info(logEntry.message, logEntry);
  }
  
  // Also log to combined.log (all logs including Docker)
  if (level in logger.levels) {
    (logger as any)[level](logEntry.message, logEntry);
  } else {
    logger.info(logEntry.message, logEntry);
  }
  
  // Also log to console with Docker indicator for immediate visibility
  const consoleMessage = `🐳 [${entry.containerName}] ${entry.message}`;
  console.log(`${new Date().toISOString()} ${consoleMessage}`);
}