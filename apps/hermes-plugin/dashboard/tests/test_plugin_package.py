"""Packaging contract for the complete local Hermes plugin."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
from pathlib import Path

import yaml


PLUGIN_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = PLUGIN_ROOT / "plugin.yaml"
LIFECYCLE = PLUGIN_ROOT / "hermes-local.sh"
RELEASE_WORKFLOW = PLUGIN_ROOT.parents[1] / ".github" / "workflows" / "release-plugin.yml"


def _run_lifecycle(
    action: str,
    *,
    home: Path,
    fake_bin: Path,
    project_root: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "HOME": str(home),
            "HERMES_HOME": str(home / ".hermes"),
            "PATH": f"{fake_bin}:{env['PATH']}",
        }
    )
    if project_root is not None:
        env["UH_PROJECT_ROOT"] = str(project_root)
    else:
        env.pop("UH_PROJECT_ROOT", None)
    return subprocess.run(
        [str(LIFECYCLE), action],
        cwd=PLUGIN_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _fake_hermes(tmp_path: Path) -> tuple[Path, Path]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    log = tmp_path / "hermes-argv.jsonl"
    executable = fake_bin / "hermes"
    executable.write_text(
        "#!/bin/sh\n"
        "python3 -c 'import json, os, sys; "
        "open(os.environ[\"FAKE_HERMES_LOG\"], \"a\").write(json.dumps(sys.argv[1:]) + \"\\n\")' "
        '"$@"\n',
        encoding="utf-8",
    )
    executable.chmod(0o755)
    return fake_bin, log


def _logged_calls(log: Path) -> list[list[str]]:
    return [json.loads(line) for line in log.read_text(encoding="utf-8").splitlines()]


def test_root_manifest_is_metadata_only_and_matches_dashboard() -> None:
    manifest = yaml.safe_load(MANIFEST_PATH.read_text(encoding="utf-8"))
    dashboard = json.loads((PLUGIN_ROOT / "dashboard" / "manifest.json").read_text())

    assert manifest == {
        "name": "uh",
        "version": dashboard["version"],
        "description": "Ultimate Harness dashboard and Delivery Observatory for Hermes Agent.",
    }
    assert not ({"capabilities", "hooks", "provides_hooks", "provides_tools"} & manifest.keys())


def test_native_register_is_deliberately_noop() -> None:
    spec = importlib.util.spec_from_file_location("uh_hermes_plugin", PLUGIN_ROOT / "__init__.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class NoHostAuthority:
        def __getattr__(self, name: str) -> object:
            raise AssertionError(f"register accessed host authority: {name}")

    assert module.register(NoHostAuthority()) is None


def test_release_tarball_stages_the_complete_plugin_contract() -> None:
    workflow = RELEASE_WORKFLOW.read_text(encoding="utf-8")

    for package_file in ("plugin.yaml", "__init__.py", "hermes-local.sh"):
        assert f"apps/hermes-plugin/{package_file}" in workflow


def test_local_lifecycle_links_enables_starts_and_rolls_back(tmp_path: Path) -> None:
    fake_bin, log = _fake_hermes(tmp_path)
    home = tmp_path / "home"
    project_root = tmp_path / "project"
    (project_root / ".harness").mkdir(parents=True)
    env_log = {"FAKE_HERMES_LOG": str(log)}

    # The fake executable needs one extra env var without weakening the helper's
    # controlled HOME/HERMES_HOME/PATH setup.
    os.environ.update(env_log)
    try:
        installed = _run_lifecycle("install", home=home, fake_bin=fake_bin)
        assert installed.returncode == 0, installed.stderr
        plugin_link = home / ".hermes" / "plugins" / "uh"
        theme_link = home / ".hermes" / "dashboard-themes" / "ultimate-harness.yaml"
        assert plugin_link.is_symlink()
        assert plugin_link.resolve() == PLUGIN_ROOT
        assert theme_link.is_symlink()
        assert theme_link.resolve() == PLUGIN_ROOT / "theme" / "ultimate-harness.yaml"

        enabled = _run_lifecycle("enable", home=home, fake_bin=fake_bin)
        assert enabled.returncode == 0, enabled.stderr
        assert _logged_calls(log)[-1] == ["plugins", "enable", "uh", "--no-allow-tool-override"]

        missing_root = _run_lifecycle("start", home=home, fake_bin=fake_bin)
        assert missing_root.returncode != 0
        assert "UH_PROJECT_ROOT" in missing_root.stderr

        started = _run_lifecycle(
            "start", home=home, fake_bin=fake_bin, project_root=project_root
        )
        assert started.returncode == 0, started.stderr
        assert _logged_calls(log)[-1] == [
            "dashboard",
            "--host",
            "127.0.0.1",
            "--port",
            "9119",
            "--no-open",
        ]

        rolled_back = _run_lifecycle("rollback", home=home, fake_bin=fake_bin)
        assert rolled_back.returncode == 0, rolled_back.stderr
        assert _logged_calls(log)[-1] == ["plugins", "disable", "uh"]
        assert not plugin_link.exists()
        assert not theme_link.exists()
    finally:
        os.environ.pop("FAKE_HERMES_LOG", None)
