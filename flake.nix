{
  description = "Mycelium v2 - Agent Orchestration System";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    # For multi-system support
    systems.url = "github:nix-systems/default";

    # Home Manager for user-level services
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Flake-parts for cleaner flake organization
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs = inputs@{ self, nixpkgs, systems, home-manager, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import systems;

      perSystem = { config, self', inputs', pkgs, system, ... }: {
        # =================================================================
        # Development Shells
        # =================================================================
        devShells = {
          default = pkgs.mkShell {
            name = "mycelium-v2";

            packages = with pkgs; [
              # Runtime
              bun
              nodejs_22

              # TypeScript tooling
              typescript
              nodePackages.typescript-language-server

              # Database
              sqlite

              # Development
              nodePackages.prettier
              git
              curl
              jq

              # Process management
              overmind  # Procfile-based process manager
            ];

            shellHook = ''
              echo ""
              echo "Mycelium v2 Development Environment"
              echo "===================================="
              echo "  Bun:        $(bun --version)"
              echo "  Node:       $(node --version)"
              echo "  TypeScript: $(tsc --version 2>/dev/null || echo 'run: bun install')"
              echo ""
              echo "Commands:"
              echo "  bun run dev         - Start backend (port 8765)"
              echo "  bun run dev:client  - Start frontend (port 5765)"
              echo "  bun run build       - Build all packages"
              echo "  mycel --help        - CLI help (after: bun link)"
              echo ""

              # Environment
              export MYCELIUM_DATA_DIR="$HOME/.config/mycelium-v2"
              export DATABASE_PATH="$MYCELIUM_DATA_DIR/mycelium.db"
              export NODE_ENV="development"

              # Ensure data directory exists
              mkdir -p "$MYCELIUM_DATA_DIR"

              # Install deps if needed
              if [ ! -d "node_modules" ]; then
                echo "Installing dependencies..."
                bun install
              fi
            '';

            # Environment variables available in shell
            MYCELIUM_DATA_DIR = "$HOME/.config/mycelium-v2";
          };

          # Minimal shell for CI/testing
          ci = pkgs.mkShell {
            packages = with pkgs; [ bun nodejs_22 sqlite git ];
          };
        };

        # =================================================================
        # Packages
        # =================================================================
        packages = {
          # Server binary
          mycelium-server = pkgs.stdenv.mkDerivation {
            pname = "mycelium-server";
            version = "2.0.0";
            src = ./.;

            nativeBuildInputs = with pkgs; [ bun nodejs_22 ];

            buildPhase = ''
              export HOME=$(mktemp -d)
              bun install --frozen-lockfile
              bun run build:shared
              bun run build:server
            '';

            installPhase = ''
              mkdir -p $out/bin $out/lib/mycelium
              cp -r packages/server/dist/* $out/lib/mycelium/
              cp -r packages/shared/dist $out/lib/mycelium/shared

              # Create wrapper script
              cat > $out/bin/mycelium-server << 'EOF'
              #!/usr/bin/env bash
              exec ${pkgs.bun}/bin/bun run $out/lib/mycelium/index.js "$@"
              EOF
              chmod +x $out/bin/mycelium-server
            '';

            meta = with pkgs.lib; {
              description = "Mycelium v2 backend server";
              license = licenses.mit;
              platforms = platforms.linux ++ platforms.darwin;
            };
          };

          # CLI binary
          mycel = pkgs.stdenv.mkDerivation {
            pname = "mycel";
            version = "2.0.0";
            src = ./.;

            nativeBuildInputs = with pkgs; [ bun nodejs_22 ];

            buildPhase = ''
              export HOME=$(mktemp -d)
              bun install --frozen-lockfile
              bun run build:shared
              bun run build:cli
            '';

            installPhase = ''
              mkdir -p $out/bin $out/lib/mycel
              cp -r packages/cli/dist/* $out/lib/mycel/
              cp -r packages/shared/dist $out/lib/mycel/shared

              cat > $out/bin/mycel << 'EOF'
              #!/usr/bin/env bash
              exec ${pkgs.bun}/bin/bun run $out/lib/mycel/index.js "$@"
              EOF
              chmod +x $out/bin/mycel
            '';

            meta = with pkgs.lib; {
              description = "Mycelium v2 CLI";
              license = licenses.mit;
              platforms = platforms.linux ++ platforms.darwin;
            };
          };

          default = self'.packages.mycel;
        };

        # =================================================================
        # Formatter
        # =================================================================
        formatter = pkgs.nixpkgs-fmt;
      };

      # =================================================================
      # Flake-wide outputs (modules, overlays)
      # =================================================================
      flake = {
        # Home Manager module for user-level mycelium service
        homeManagerModules.default = ./nix/home-manager-module.nix;
        homeManagerModules.mycelium = ./nix/home-manager-module.nix;

        # NixOS module for system-level deployment
        nixosModules.default = ./nix/nixos-module.nix;
        nixosModules.mycelium = ./nix/nixos-module.nix;

        # Overlay to add mycelium packages to nixpkgs
        overlays.default = final: prev: {
          mycelium-server = self.packages.${final.system}.mycelium-server;
          mycel = self.packages.${final.system}.mycel;
        };
      };
    };
}
