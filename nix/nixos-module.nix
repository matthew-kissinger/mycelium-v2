# NixOS module for Mycelium v2
#
# Usage in your configuration.nix:
#
#   imports = [ inputs.mycelium.nixosModules.default ];
#
#   services.mycelium = {
#     enable = true;
#     port = 8765;
#     openFirewall = true;
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
    enable = mkEnableOption "Mycelium v2 agent orchestration (system-level)";

    package = mkOption {
      type = types.package;
      default = pkgs.mycelium-server or (throw "mycelium-server package not found");
      description = "The mycelium server package";
    };

    user = mkOption {
      type = types.str;
      default = "mycelium";
      description = "User to run mycelium as";
    };

    group = mkOption {
      type = types.str;
      default = "mycelium";
      description = "Group to run mycelium as";
    };

    dataDir = mkOption {
      type = types.path;
      default = "/var/lib/mycelium";
      description = "Data directory for Mycelium";
    };

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

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = "Open firewall port for mycelium";
    };

    scheduler = {
      enable = mkOption {
        type = types.bool;
        default = true;
        description = "Enable the autonomous scheduler";
      };

      config = mkOption {
        type = settingsFormat.type;
        default = { };
        description = "Scheduler configuration";
      };
    };

    extraEnv = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables";
    };
  };

  config = mkIf cfg.enable {
    # Create user and group
    users.users.${cfg.user} = mkIf (cfg.user == "mycelium") {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      description = "Mycelium service user";
    };

    users.groups.${cfg.group} = mkIf (cfg.group == "mycelium") { };

    # Open firewall
    networking.firewall.allowedTCPPorts = mkIf cfg.openFirewall [ cfg.port ];

    # Systemd service
    systemd.services.mycelium = {
      description = "Mycelium v2 Backend Server";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        ExecStart = "${cfg.package}/bin/mycelium-server";
        Restart = "on-failure";
        RestartSec = 5;

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        ReadWritePaths = [ cfg.dataDir ];

        # Working directory
        WorkingDirectory = cfg.dataDir;
        StateDirectory = mkIf (cfg.dataDir == "/var/lib/mycelium") "mycelium";
      };

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        DATABASE_PATH = "${cfg.dataDir}/mycelium.db";
        MYCELIUM_DATA_DIR = cfg.dataDir;
      } // cfg.extraEnv
        // (optionalAttrs cfg.scheduler.enable { SCHEDULER_AUTO_START = "true"; });
    };

    # Scheduler config file
    environment.etc."mycelium/scheduler.json" = mkIf (cfg.scheduler.config != { }) {
      source = settingsFormat.generate "scheduler.json" cfg.scheduler.config;
    };
  };
}
