# Home Manager module for Mycelium v2
#
# Usage in your home.nix:
#
#   imports = [ inputs.mycelium.homeManagerModules.default ];
#
#   services.mycelium = {
#     enable = true;
#     server.enable = true;
#     server.port = 8765;
#   };
#
{ config, lib, pkgs, ... }:

with lib;

let
  cfg = config.services.mycelium;
  settingsFormat = pkgs.formats.json { };
in
{
  options.services.mycelium = {
    enable = mkEnableOption "Mycelium v2 agent orchestration";

    package = mkOption {
      type = types.package;
      default = pkgs.mycel or (throw "mycelium package not found - add the overlay or specify package");
      description = "The mycelium CLI package to use";
    };

    serverPackage = mkOption {
      type = types.package;
      default = pkgs.mycelium-server or cfg.package;
      description = "The mycelium server package to use";
    };

    dataDir = mkOption {
      type = types.path;
      default = "${config.home.homeDirectory}/.config/mycelium-v2";
      description = "Data directory for Mycelium";
    };

    # =========================================================================
    # Server configuration
    # =========================================================================
    server = {
      enable = mkEnableOption "Mycelium backend server as a systemd user service";

      port = mkOption {
        type = types.port;
        default = 8765;
        description = "Port for the Mycelium backend server";
      };

      host = mkOption {
        type = types.str;
        default = "0.0.0.0";
        description = "Host to bind the server to";
      };

      autoStart = mkOption {
        type = types.bool;
        default = true;
        description = "Start the server automatically on login";
      };
    };

    # =========================================================================
    # Scheduler configuration
    # =========================================================================
    scheduler = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Enable the autonomous scheduler";
      };

      autoStart = mkOption {
        type = types.bool;
        default = true;
        description = "Auto-start scheduler when server starts";
      };

      config = mkOption {
        type = settingsFormat.type;
        default = { };
        description = "Scheduler configuration (merged with defaults)";
        example = literalExpression ''
          {
            dispatcher_enabled = true;
            dispatcher_interval_sec = 60;
            max_concurrent_tasks = 3;
            discovery_enabled = true;
            discovery_interval_sec = 600;
          }
        '';
      };
    };

    # =========================================================================
    # Telegram integration
    # =========================================================================
    telegram = {
      enable = mkEnableOption "Telegram integration for alignment signals";

      botTokenFile = mkOption {
        type = types.nullOr types.path;
        default = null;
        description = "Path to file containing Telegram bot token (for secrets management)";
      };

      chatId = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "Telegram chat ID for notifications";
      };
    };

    # =========================================================================
    # Agent CLIs
    # =========================================================================
    agents = {
      claude = {
        enable = mkOption {
          type = types.bool;
          default = true;
          description = "Enable Claude Code agent";
        };
        package = mkOption {
          type = types.nullOr types.package;
          default = null;
          description = "Claude Code package (if available in nixpkgs)";
        };
      };

      # Placeholder for other agents - these would need packages
      codex.enable = mkOption {
        type = types.bool;
        default = false;
        description = "Enable Codex agent";
      };

      gemini.enable = mkOption {
        type = types.bool;
        default = false;
        description = "Enable Gemini agent";
      };
    };

    # =========================================================================
    # Extra environment variables
    # =========================================================================
    extraEnv = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables for the server";
      example = {
        LOG_LEVEL = "debug";
      };
    };
  };

  config = mkIf cfg.enable {
    # =========================================================================
    # Ensure directories exist
    # =========================================================================
    home.activation.myceliumSetup = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      run mkdir -p "${cfg.dataDir}"
      run mkdir -p "${cfg.dataDir}/logs"
    '';

    # =========================================================================
    # Install CLI
    # =========================================================================
    home.packages = [ cfg.package ];

    # =========================================================================
    # Scheduler configuration file
    # =========================================================================
    home.file."${cfg.dataDir}/scheduler.json" = mkIf (cfg.scheduler.config != { }) {
      source = settingsFormat.generate "scheduler.json" cfg.scheduler.config;
    };

    # =========================================================================
    # Systemd user service for the backend
    # =========================================================================
    systemd.user.services.mycelium = mkIf cfg.server.enable {
      Unit = {
        Description = "Mycelium v2 Backend Server";
        After = [ "network.target" ];
      };

      Install = mkIf cfg.server.autoStart {
        WantedBy = [ "default.target" ];
      };

      Service = {
        Type = "simple";
        ExecStart = "${cfg.serverPackage}/bin/mycelium-server";
        Restart = "on-failure";
        RestartSec = 5;

        # Working directory
        WorkingDirectory = cfg.dataDir;

        # Environment
        Environment = [
          "PORT=${toString cfg.server.port}"
          "HOST=${cfg.server.host}"
          "DATABASE_PATH=${cfg.dataDir}/mycelium.db"
          "MYCELIUM_DATA_DIR=${cfg.dataDir}"
        ]
        ++ (mapAttrsToList (k: v: "${k}=${v}") cfg.extraEnv)
        ++ (optional (cfg.scheduler.enable && cfg.scheduler.autoStart) "SCHEDULER_AUTO_START=true")
        ++ (optional (cfg.telegram.chatId != null) "TELEGRAM_CHAT_ID=${cfg.telegram.chatId}");

        # Load token from file if specified
        EnvironmentFile = mkIf (cfg.telegram.enable && cfg.telegram.botTokenFile != null)
          cfg.telegram.botTokenFile;
      };
    };

    # =========================================================================
    # Health check timer (optional - for monitoring)
    # =========================================================================
    systemd.user.timers.mycelium-health = mkIf cfg.server.enable {
      Unit = {
        Description = "Mycelium health check timer";
      };
      Timer = {
        OnCalendar = "*:0/5"; # Every 5 minutes
        Persistent = true;
      };
      Install = {
        WantedBy = [ "timers.target" ];
      };
    };

    systemd.user.services.mycelium-health = mkIf cfg.server.enable {
      Unit = {
        Description = "Mycelium health check";
        After = [ "mycelium.service" ];
      };
      Service = {
        Type = "oneshot";
        ExecStart = pkgs.writeShellScript "mycelium-health-check" ''
          ${pkgs.curl}/bin/curl -sf http://localhost:${toString cfg.server.port}/api/health || {
            echo "Mycelium health check failed"
            exit 1
          }
        '';
      };
    };
  };
}
