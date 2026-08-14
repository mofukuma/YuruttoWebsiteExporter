"""gdweb専用ExporterをEditor buildだけへ組み込む。"""


def can_build(env, platform):
    """runtimeからEditor依存を除外する。"""
    return bool(env.editor_build)


def configure(env):
    """追加設定を持たない。"""
    pass


def get_doc_classes():
    """公開script classを追加しない。"""
    return []


def get_doc_path():
    """文書生成対象を持たない。"""
    return ""
