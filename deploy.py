"""
一键同步部署本地导航网站到服务器 (38.6.219.40:8888)
"""
import io
import os
import sys
import tarfile
import tempfile
import urllib.request
import paramiko

# 确保在 Windows 终端中 UTF-8 输出正常，避免中文乱码
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

HOST = "38.6.219.40"
PORT = 8888
SSH_PORT = 22
USER = "root"
PASSWORD_FILE = r"C:\Users\31848\Desktop\38.6.219.40.txt"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_secret(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def connect_ssh(host, user, secret, port=22, timeout=15):
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    # 智能识别：如果是 SSH 私钥格式则作为密钥加载，否则作为密码连接
    if "PRIVATE KEY" in secret or secret.startswith("-----BEGIN"):
        key_obj = None
        for key_class in (paramiko.RSAKey, paramiko.Ed25519Key, paramiko.ECDSAKey):
            try:
                key_obj = key_class.from_private_key(io.StringIO(secret))
                break
            except Exception:
                continue
        if key_obj:
            ssh.connect(host, port=port, username=user, pkey=key_obj, timeout=timeout)
            return ssh

    # 默认作为 SSH 登录密码连接
    ssh.connect(host, port=port, username=user, password=secret, timeout=timeout)
    return ssh


def main():
    secret = load_secret(PASSWORD_FILE)
    if not secret:
        print(f"错误: 找不到凭据文件 {PASSWORD_FILE}")
        input("按回车键退出...")
        sys.exit(1)

    print("=" * 55)
    print(f" 开始同步个人导航到服务器: http://{HOST}:{PORT}")
    print("=" * 55)

    # 1. 打包本地静态资源
    temp_tar = os.path.join(tempfile.gettempdir(), "nav_deploy.tar.gz")
    items_to_sync = ["index.html", "bookmarks.js", "bookmarks.json", "css", "js", "assets", "icons"]

    print("[1/3] 正在打包本地静态文件...")
    with tarfile.open(temp_tar, "w:gz") as tar:
        for item in items_to_sync:
            full = os.path.join(BASE_DIR, item)
            if os.path.exists(full):
                tar.add(full, arcname=item)
                print(f"  + {item}")

    size_kb = os.path.getsize(temp_tar) / 1024
    print(f"  -> 打包完成 (压缩后大小: {size_kb:.1f} KB)")

    # 2. 上传文件到远程服务器
    print(f"\n[2/3] 正在连接服务器并上传至 {HOST} ...")
    try:
        ssh = connect_ssh(HOST, USER, secret, port=SSH_PORT, timeout=15)
    except Exception as e:
        print(f"SSH 连接失败: {e}")
        if os.path.exists(temp_tar):
            os.remove(temp_tar)
        sys.exit(1)

    sftp = ssh.open_sftp()
    remote_tmp = "/tmp/nav_sync.tar.gz"
    sftp.put(temp_tar, remote_tmp)
    sftp.close()
    print("  -> 上传完成")

    # 3. 远程解压、赋权、刷新服务
    print("\n[3/3] 正在解压并更新 Web 网站目录...")
    cmd = """
    mkdir -p /var/www/nav
    tar -xzf /tmp/nav_sync.tar.gz -C /var/www/nav
    chown -R www-data:www-data /var/www/nav
    chmod -R 755 /var/www/nav
    rm -f /tmp/nav_sync.tar.gz
    """
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    ssh.close()

    if os.path.exists(temp_tar):
        os.remove(temp_tar)

    if exit_status != 0:
        print(f"远程解压出现异常，退出码: {exit_status}")
        sys.exit(1)

    print("\n" + "=" * 55)
    print(" 部署同步成功！")
    print(f" 访问地址: http://{HOST}:{PORT}")
    print("=" * 55)

    # 自动探测远程 HTTP 状态
    try:
        req = urllib.request.Request(f"http://{HOST}:{PORT}", headers={"User-Agent": "DeployCheck/1.0"})
        with urllib.request.urlopen(req, timeout=5) as res:
            print(f"  [HTTP 响应] 状态码: {res.status} OK")
    except Exception as e:
        print(f"  [提示] 自动健康检查: {e}")


if __name__ == "__main__":
    main()
