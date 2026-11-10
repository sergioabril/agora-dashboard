.PHONY: build deploy

CONFIG_DIR ?= $(HOME)/.config/agora/agora-dashboard
HUB_HOST ?=
HUB_TOKEN ?=

build:
	docker build -t agora-dashboard:local .

# Creates CONFIG_DIR (and its parents) and .env only if missing, saves HUB_HOST/HUB_TOKEN into .env
# when given, then (re)starts the container.
deploy: build
	@set -e; umask 077; dir="$(CONFIG_DIR)"; env="$$dir/.env"; \
	mkdir -p "$$dir"; chmod 700 "$$dir"; \
	[ -e "$$env" ] || sed -e 's|^AGORA_HUB_URL=.*|AGORA_HUB_URL=http://host.docker.internal:3333|' \
	  -e '/^PORT=/d' .env.example > "$$env"; \
	put() { awk -v k="$$1" -v v="$$2" 'index($$0, k "=") == 1 { print k "=" v; done = 1; next } { print } END { if (!done) print k "=" v }' "$$env" > "$$env.tmp" && mv "$$env.tmp" "$$env"; }; \
	[ -z "$(HUB_HOST)" ] || put AGORA_HUB_URL "http://$(HUB_HOST):3333"; \
	[ -z "$(HUB_TOKEN)" ] || put AGORA_HUB_ADMIN_TOKEN "$(HUB_TOKEN)"; \
	echo "agora-dashboard config: $$dir"
	@docker rm -f agora-dashboard >/dev/null 2>&1 || true
	docker run -d --restart unless-stopped --name agora-dashboard --publish 4444:4444 \
	  --user "$$(id -u):$$(id -g)" --add-host host.docker.internal:host-gateway \
	  --mount type=bind,src="$(CONFIG_DIR)",dst=/config,readonly agora-dashboard:local
	@echo "agora-dashboard deployed on :4444 (logs: docker logs -f agora-dashboard)"
